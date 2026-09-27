"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceScanner = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
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
    'setup.py', 'setup.cfg', 'go.mod',
];
/**
 * Discovers microservice directories within a workspace root.
 * Supports Spring Boot (pom.xml / build.gradle), Node.js (package.json),
 * Python (requirements.txt / pyproject.toml / setup.py / setup.cfg),
 * and Go (go.mod) projects.
 */
class WorkspaceScanner {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async discoverServices() {
        const services = [];
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
    getWorkspaceFingerprint() {
        const entries = [];
        this.collectMarkerFiles(this.workspaceRoot, 0, entries);
        entries.sort();
        return crypto
            .createHash('sha1')
            .update(entries.join('\n'))
            .digest('hex')
            .slice(0, 16);
    }
    collectMarkerFiles(dir, depth, out) {
        if (depth > MAX_DEPTH)
            return;
        let dirEntries;
        try {
            dirEntries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of dirEntries) {
            if (entry.isFile() && MARKER_FILES.includes(entry.name)) {
                try {
                    const stat = fs.statSync(path.join(dir, entry.name));
                    const rel = path.relative(this.workspaceRoot, path.join(dir, entry.name)).replace(/\\/g, '/');
                    out.push(`${rel}:${stat.size}`);
                }
                catch {
                    // ignore
                }
            }
            else if (entry.isDirectory() && !EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
                this.collectMarkerFiles(path.join(dir, entry.name), depth + 1, out);
            }
        }
    }
    findServiceDirectories(dir, depth) {
        if (depth > MAX_DEPTH)
            return [];
        const results = [];
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return results;
        }
        // Check if this dir is a service (but not a Maven aggregator)
        const stack = this.detectStack(dir);
        if (stack !== 'unknown' && !this.isMavenAggregator(dir)) {
            results.push(dir);
            // For Spring Boot, do NOT recurse further into this service directory
            if (stack === 'spring-boot')
                return results;
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
            if (!entry.isDirectory())
                continue;
            if (EXCLUDE_DIRS.has(entry.name))
                continue;
            if (entry.name.startsWith('.'))
                continue;
            const fullPath = path.join(dir, entry.name);
            const subResults = this.findServiceDirectories(fullPath, depth + 1);
            results.push(...subResults);
        }
        return results;
    }
    /**
     * Detect the technology stack of a directory.
     */
    detectStack(dir) {
        if (fs.existsSync(path.join(dir, 'pom.xml'))) {
            // Could be Spring Boot or Maven aggregator — check content
            const pomContent = this.tryReadFile(path.join(dir, 'pom.xml')) ?? '';
            if (pomContent.includes('spring-boot') || pomContent.includes('springframework')) {
                return 'spring-boot';
            }
            // Has a pom.xml but no Spring — still treat as spring-compatible
            return 'spring-boot';
        }
        if (fs.existsSync(path.join(dir, 'build.gradle')) ||
            fs.existsSync(path.join(dir, 'build.gradle.kts'))) {
            return 'spring-boot';
        }
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return 'node';
        }
        if (fs.existsSync(path.join(dir, 'requirements.txt')) ||
            fs.existsSync(path.join(dir, 'pyproject.toml')) ||
            fs.existsSync(path.join(dir, 'setup.py')) ||
            fs.existsSync(path.join(dir, 'setup.cfg'))) {
            return 'python';
        }
        if (fs.existsSync(path.join(dir, 'go.mod'))) {
            return 'go';
        }
        return 'unknown';
    }
    /**
     * A Maven aggregator has a pom.xml with <modules> and typically packaging=pom
     * and NO src/main directory (no actual service code).
     */
    isMavenAggregator(dir) {
        const pomPath = path.join(dir, 'pom.xml');
        if (!fs.existsSync(pomPath))
            return false;
        const content = this.tryReadFile(pomPath) ?? '';
        if (!content.includes('<modules>'))
            return false;
        // If it has its own src/main, it's also a service — not a pure aggregator
        if (fs.existsSync(path.join(dir, 'src', 'main')))
            return false;
        return true;
    }
    /**
     * Extract module names from a Maven aggregator pom.xml.
     */
    getMavenModules(dir) {
        const pomPath = path.join(dir, 'pom.xml');
        const content = this.tryReadFile(pomPath) ?? '';
        const moduleMatches = [...content.matchAll(/<module>\s*([^<]+)\s*<\/module>/g)];
        return moduleMatches.map(m => m[1].trim());
    }
    tryReadFile(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        }
        catch {
            return null;
        }
    }
    async analyzeDirectory(dirPath) {
        const stack = this.detectStack(dirPath);
        if (stack === 'unknown')
            return null;
        const name = path.basename(dirPath);
        let gitRoot = null;
        let branch = 'main';
        let commitHash = 'unknown';
        let isGitRepo = false;
        try {
            gitRoot = (0, child_process_1.execSync)('git rev-parse --show-toplevel', {
                cwd: dirPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            isGitRepo = true;
            branch = (0, child_process_1.execSync)('git rev-parse --abbrev-ref HEAD', {
                cwd: dirPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            commitHash = (0, child_process_1.execSync)('git rev-parse HEAD', {
                cwd: dirPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
        }
        catch {
            // Not a git repo or git not available
        }
        const repository = gitRoot ?? dirPath;
        // F09 fix: canonical serviceId = namespace (repo name or workspace-relative path) + service dir name
        const serviceId = this.generateServiceId(dirPath, repository);
        return {
            serviceId,
            name,
            rootPath: dirPath,
            repository,
            branch,
            commitHash,
            isGitRepo,
            detectedStack: stack,
        };
    }
    /**
     * F09: Generate a canonical, unique service ID.
     * Uses workspace-relative path so two services with the same dir name get different IDs.
     */
    generateServiceId(dirPath, repository) {
        // Make it relative to workspace root to avoid collision
        const relToWorkspace = path.relative(this.workspaceRoot, dirPath);
        // Normalize path separators and sanitize
        const normalized = relToWorkspace
            .replace(/\\/g, '/')
            .toLowerCase()
            .replace(/[^a-z0-9/-]/g, '-')
            .replace(/\/+/g, '-')
            .replace(/^-+|-+$/g, '');
        return normalized || path.basename(dirPath).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }
    countFiles(dirPath, extensions = ['.java']) {
        let count = 0;
        try {
            const walk = (dir) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (EXCLUDE_DIRS.has(entry.name))
                        continue;
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walk(full);
                    }
                    else if (extensions.some(ext => entry.name.endsWith(ext))) {
                        count++;
                    }
                }
            };
            walk(dirPath);
        }
        catch {
            // ignore
        }
        return count;
    }
}
exports.WorkspaceScanner = WorkspaceScanner;
//# sourceMappingURL=WorkspaceScanner.js.map