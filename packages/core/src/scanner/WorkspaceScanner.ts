import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DiscoveredService } from '../models/types';

/**
 * Discovers microservice directories within a workspace root.
 * Looks for directories containing pom.xml or build.gradle (Spring Boot indicators).
 */
export class WorkspaceScanner {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async discoverServices(): Promise<DiscoveredService[]> {
    const services: DiscoveredService[] = [];
    const candidates = this.findServiceDirectories(this.workspaceRoot);

    for (const candidate of candidates) {
      const service = await this.analyzeDirectory(candidate);
      if (service) {
        services.push(service);
      }
    }

    return services;
  }

  private findServiceDirectories(root: string): string[] {
    const results: string[] = [];

    // Check root itself
    if (this.isServiceDirectory(root)) {
      results.push(root);
      return results; // Don't recurse into a service dir
    }

    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        const fullPath = path.join(root, entry.name);
        if (this.isServiceDirectory(fullPath)) {
          results.push(fullPath);
        } else {
          // Check one level deeper (monorepo style)
          try {
            const sub = fs.readdirSync(fullPath, { withFileTypes: true });
            for (const subEntry of sub) {
              if (!subEntry.isDirectory()) continue;
              if (subEntry.name.startsWith('.')) continue;
              const subPath = path.join(fullPath, subEntry.name);
              if (this.isServiceDirectory(subPath)) {
                results.push(subPath);
              }
            }
          } catch {
            // ignore unreadable
          }
        }
      }
    } catch {
      // ignore
    }

    return results;
  }

  private isServiceDirectory(dir: string): boolean {
    return (
      fs.existsSync(path.join(dir, 'pom.xml')) ||
      fs.existsSync(path.join(dir, 'build.gradle')) ||
      fs.existsSync(path.join(dir, 'build.gradle.kts'))
    );
  }

  private async analyzeDirectory(dirPath: string): Promise<DiscoveredService | null> {
    const name = path.basename(dirPath);
    const serviceId = this.generateServiceId(dirPath);

    let repository = dirPath;
    let branch = 'main';
    let commitHash = 'unknown';
    let isGitRepo = false;

    try {
      // Find git root
      const gitRoot = execSync('git rev-parse --show-toplevel', {
        cwd: dirPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      repository = gitRoot;
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

    // Detect stack
    const detectedStack = this.isSpringBootService(dirPath) ? 'spring-boot' : 'unknown';

    return {
      serviceId,
      name,
      rootPath: dirPath,
      repository,
      branch,
      commitHash,
      isGitRepo,
      detectedStack,
    };
  }

  private isSpringBootService(dir: string): boolean {
    // Check pom.xml for spring-boot dependency
    const pomPath = path.join(dir, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      const content = fs.readFileSync(pomPath, 'utf8');
      return content.includes('spring-boot') || content.includes('springframework');
    }
    return false;
  }

  generateServiceId(dirPath: string): string {
    return path.basename(dirPath).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  countFiles(dirPath: string, extensions: string[] = ['.java']): number {
    let count = 0;
    try {
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target') continue;
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
