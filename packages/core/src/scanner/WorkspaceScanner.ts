import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DiscoveredService } from '../models/types';

/** Directories that should never be treated as service roots */
const EXCLUDE_DIRS = new Set([
  'node_modules', 'target', 'build', 'dist', '.git', '.idea', '.vscode',
  '__pycache__', '.cache', 'vendor', 'out', 'bin', '.gradle',
]);

/** Max depth to recurse when searching for services */
const MAX_DEPTH = 5;

/** Marker files that indicate a service boundary */
const MARKER_FILES = [
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  'package.json', 'requirements.txt', 'pyproject.toml',
  'setup.py', 'setup.cfg', 'go.mod', 'composer.json', 'Dockerfile', 'compose.yaml', 'compose.yml',
];

/**
 * Discovers microservice directories within a workspace root.
 * Supports Spring Boot (pom.xml / build.gradle), Node.js (package.json),
 * Python (requirements.txt / pyproject.toml / setup.py / setup.cfg),
 * and Go (go.mod) projects.
 */
export class WorkspaceScanner {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async discoverServices(): Promise<DiscoveredService[]> {
    const services: DiscoveredService[] = [];
    const candidates = this.findServiceDirectories(this.workspaceRoot, 0);

    for (const candidate of candidates) {
      const service = await this.analyzeDirectory(candidate);
      if (service) {
        services.push(service);
      }
    }

    return services;
  }

  /**
   * Compute a cheap fingerprint of the workspace's service-discovery topology.
   * Hashes the relative paths and sizes of all marker files (pom.xml,
   * package.json, go.mod, etc.) found up to MAX_DEPTH. When this value is
   * the same as what is stored in the cache, service discovery can be skipped
   * entirely and the cached service list reused.
   *
   * No file content is read — only stat() calls, so it is very fast.
   */
  getWorkspaceFingerprint(): string {
    const entries: string[] = [];
    this.collectMarkerFiles(this.workspaceRoot, 0, entries);
    entries.sort();
    return crypto
      .createHash('sha1')
      .update(fs.realpathSync(this.workspaceRoot) + '\n' + entries.join('\n'))
      .digest('hex')
      .slice(0, 16);
  }

  private collectMarkerFiles(dir: string, depth: number, out: string[]): void {
    if (depth > MAX_DEPTH) return;

    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      if (entry.isFile() && MARKER_FILES.includes(entry.name)) {
        try {
          const stat = fs.statSync(path.join(dir, entry.name));
          const rel = path.relative(this.workspaceRoot, path.join(dir, entry.name)).replace(/\\/g, '/');
          out.push(`${rel}:${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, entry.name))).digest('hex')}`);
        } catch {
          // ignore
        }
      } else if (entry.isDirectory() && !EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        this.collectMarkerFiles(path.join(dir, entry.name), depth + 1, out);
      }
    }
  }

  private findServiceDirectories(dir: string, depth: number): string[] {
    if (depth > MAX_DEPTH) return [];

    const results: string[] = [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    // Check if this dir is a service (but not a Maven aggregator)
    const stack = this.detectStack(dir);
    if (stack !== 'unknown' && !this.isMavenAggregator(dir)) {
      results.push(dir);
      // For Spring Boot, do NOT recurse further into this service directory
      if (stack === 'spring-boot') return results;
    }

    // If it IS a Maven aggregator, recurse into declared modules
    if (this.isMavenAggregator(dir)) {
      const moduleNames = this.getMavenModules(dir);
      for (const modName of moduleNames) {
        const modPath = path.join(dir, modName);
        if (fs.existsSync(modPath)) {
          const subResults = this.findServiceDirectories(modPath, depth + 1);
          results.push(...subResults);
        }
      }
      return results;
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);
      const subResults = this.findServiceDirectories(fullPath, depth + 1);
      results.push(...subResults);
    }

    return results;
  }

  /**
   * Detect the technology stack of a directory.
   */
  detectStack(dir: string): DiscoveredService['detectedStack'] {
    if (fs.existsSync(path.join(dir, 'pom.xml'))) {
      // Could be Spring Boot or Maven aggregator — check content
      const pomContent = this.tryReadFile(path.join(dir, 'pom.xml')) ?? '';
      if (pomContent.includes('spring-boot') || pomContent.includes('springframework')) {
        return 'spring-boot';
      }
      // Has a pom.xml but no Spring — still treat as spring-compatible
      return 'spring-boot';
    }
    if (
      fs.existsSync(path.join(dir, 'build.gradle')) ||
      fs.existsSync(path.join(dir, 'build.gradle.kts'))
    ) {
      return 'spring-boot';
    }
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return 'node';
    }
    if (
      fs.existsSync(path.join(dir, 'requirements.txt')) ||
      fs.existsSync(path.join(dir, 'pyproject.toml')) ||
      fs.existsSync(path.join(dir, 'setup.py')) ||
      fs.existsSync(path.join(dir, 'setup.cfg'))
    ) {
      return 'python';
    }
    if (fs.existsSync(path.join(dir, 'go.mod'))) {
      return 'go';
    }
    if (fs.existsSync(path.join(dir, 'composer.json'))) return 'php';
    if (fs.existsSync(path.join(dir, 'Dockerfile'))) {
      const files = fs.readdirSync(dir);
      if (files.some(f => f.endsWith('.php'))) return 'php';
      if (files.some(f => f.endsWith('.java'))) return 'java';
    }
    return 'unknown';
  }

  /**
   * A Maven aggregator has a pom.xml with <modules> and typically packaging=pom
   * and NO src/main directory (no actual service code).
   */
  private isMavenAggregator(dir: string): boolean {
    const pomPath = path.join(dir, 'pom.xml');
    if (!fs.existsSync(pomPath)) return false;
    const content = this.tryReadFile(pomPath) ?? '';
    if (!content.includes('<modules>')) return false;
    // If it has its own src/main, it's also a service — not a pure aggregator
    if (fs.existsSync(path.join(dir, 'src', 'main'))) return false;
    return true;
  }

  /**
   * Extract module names from a Maven aggregator pom.xml.
   */
  private getMavenModules(dir: string): string[] {
    const pomPath = path.join(dir, 'pom.xml');
    const content = this.tryReadFile(pomPath) ?? '';
    const moduleMatches = [...content.matchAll(/<module>\s*([^<]+)\s*<\/module>/g)];
    return moduleMatches.map(m => m[1].trim());
  }

  private tryReadFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  private async analyzeDirectory(dirPath: string): Promise<DiscoveredService | null> {
    const stack = this.detectStack(dirPath);
    if (stack === 'unknown') return null;

    const name = path.basename(dirPath);

    let gitRoot: string | null = null;
    let branch = 'main';
    let commitHash = 'unknown';
    let isGitRepo = false;

    try {
      gitRoot = execSync('git rev-parse --show-toplevel', {
        cwd: dirPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      isGitRepo = true;

      branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: dirPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      commitHash = execSync('git rev-parse HEAD', {
        cwd: dirPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      // Not a git repo or git not available
    }

    // Resolve symlinks so that repository and rootPath share the same prefix,
    // enabling correct path.relative() computation in the engine.
    const resolveReal = (p: string) => { try { return fs.realpathSync(p); } catch { return p; } };
    const repository = resolveReal(gitRoot ?? dirPath);
    const rootPath = resolveReal(dirPath);

    // F09 fix: canonical serviceId = namespace (repo name or workspace-relative path) + service dir name
    const serviceId = this.generateServiceId(dirPath, repository);

    return {
      serviceId,
      name,
      rootPath,
      repository,
      branch,
      commitHash,
      isGitRepo,
      detectedStack: stack,
    };
  }

  /**
   * F09: Generate a canonical, unique service ID.
   * Uses the workspace-relative path with segments separated by '/' so that
   * `team-a/order-service` and `team/a-order-service` produce different IDs.
   *
   * Format: `<segment1>/<segment2>/.../<leafName>` — slashes are preserved so
   * the path structure remains unambiguous. Each segment is sanitized to
   * lowercase alphanumeric + hyphens.
   */
  generateServiceId(dirPath: string, repository?: string): string {
    const relative = path.relative(this.workspaceRoot, dirPath).split(path.sep).join('/');
    return (relative || path.basename(dirPath)).split('/').map(segment => encodeURIComponent(segment)).join('/');
  }

  countFiles(dirPath: string, extensions: string[] = ['.java']): number {
    let count = 0;
    try {
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (EXCLUDE_DIRS.has(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (extensions.some(ext => entry.name.endsWith(ext))) {
            count++;
          }
        }
      };
      walk(dirPath);
    } catch {
      // ignore
    }
    return count;
  }
}
