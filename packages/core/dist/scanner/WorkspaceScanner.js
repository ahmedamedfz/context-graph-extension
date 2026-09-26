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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
/**
 * Discovers microservice directories within a workspace root.
 * Looks for directories containing pom.xml or build.gradle (Spring Boot indicators).
 */
class WorkspaceScanner {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async discoverServices() {
        const services = [];
        const candidates = this.findServiceDirectories(this.workspaceRoot);
        for (const candidate of candidates) {
            const service = await this.analyzeDirectory(candidate);
            if (service) {
                services.push(service);
            }
        }
        return services;
    }
    findServiceDirectories(root) {
        const results = [];
        // Check root itself
        if (this.isServiceDirectory(root)) {
            results.push(root);
            return results; // Don't recurse into a service dir
        }
        try {
            const entries = fs.readdirSync(root, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                if (entry.name.startsWith('.') || entry.name === 'node_modules')
                    continue;
                const fullPath = path.join(root, entry.name);
                if (this.isServiceDirectory(fullPath)) {
                    results.push(fullPath);
                }
                else {
                    // Check one level deeper (monorepo style)
                    try {
                        const sub = fs.readdirSync(fullPath, { withFileTypes: true });
                        for (const subEntry of sub) {
                            if (!subEntry.isDirectory())
                                continue;
                            if (subEntry.name.startsWith('.'))
                                continue;
                            const subPath = path.join(fullPath, subEntry.name);
                            if (this.isServiceDirectory(subPath)) {
                                results.push(subPath);
                            }
                        }
                    }
                    catch {
                        // ignore unreadable
                    }
                }
            }
        }
        catch {
            // ignore
        }
        return results;
    }
    isServiceDirectory(dir) {
        return (fs.existsSync(path.join(dir, 'pom.xml')) ||
            fs.existsSync(path.join(dir, 'build.gradle')) ||
            fs.existsSync(path.join(dir, 'build.gradle.kts')));
    }
    async analyzeDirectory(dirPath) {
        const name = path.basename(dirPath);
        const serviceId = this.generateServiceId(dirPath);
        let repository = dirPath;
        let branch = 'main';
        let commitHash = 'unknown';
        let isGitRepo = false;
        try {
            // Find git root
            const gitRoot = (0, child_process_1.execSync)('git rev-parse --show-toplevel', {
                cwd: dirPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            repository = gitRoot;
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
    isSpringBootService(dir) {
        // Check pom.xml for spring-boot dependency
        const pomPath = path.join(dir, 'pom.xml');
        if (fs.existsSync(pomPath)) {
            const content = fs.readFileSync(pomPath, 'utf8');
            return content.includes('spring-boot') || content.includes('springframework');
        }
        return false;
    }
    generateServiceId(dirPath) {
        return path.basename(dirPath).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }
    countFiles(dirPath, extensions = ['.java']) {
        let count = 0;
        try {
            const walk = (dir) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target')
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