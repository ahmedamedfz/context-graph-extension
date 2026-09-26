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
exports.GitAnalyzer = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
/**
 * Git operations for commit detection and diff analysis.
 */
class GitAnalyzer {
    constructor(repoPath) {
        this.repoPath = repoPath;
    }
    /**
     * Get current HEAD commit hash (short = 7 chars, long = 40 chars).
     */
    getHead(short = true) {
        try {
            return (0, child_process_1.execSync)(`git rev-parse ${short ? '--short' : ''} HEAD`, {
                cwd: this.repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
        }
        catch {
            return 'unknown';
        }
    }
    /**
     * Get current branch name.
     */
    getBranch() {
        try {
            return (0, child_process_1.execSync)('git rev-parse --abbrev-ref HEAD', {
                cwd: this.repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
        }
        catch {
            return 'main';
        }
    }
    /**
     * Get list of changed files between two commits.
     */
    getChangedFiles(oldCommit, newCommit) {
        try {
            const output = (0, child_process_1.execSync)(`git diff --name-status ${oldCommit} ${newCommit}`, {
                cwd: this.repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            if (!output)
                return [];
            return output.split('\n').map(line => {
                const [status, ...rest] = line.split('\t');
                const filePath = rest[rest.length - 1];
                const changeType = this.mapStatus(status);
                const category = this.classifyFile(filePath);
                return { path: filePath, category, changeType };
            }).filter(f => f.path);
        }
        catch {
            return [];
        }
    }
    /**
     * Get all Java files changed since a specific commit.
     */
    getChangedJavaFiles(oldCommit, newCommit) {
        return this.getChangedFiles(oldCommit, newCommit)
            .filter(f => f.path.endsWith('.java'))
            .map(f => f.path);
    }
    /**
     * Classify a file path into a category.
     */
    classifyFile(filePath) {
        const lower = filePath.toLowerCase();
        const basename = path.basename(lower);
        if (basename.endsWith('controller.java'))
            return 'API';
        if (lower.includes('/controller/'))
            return 'API';
        if (basename.endsWith('entity.java'))
            return 'ENTITY';
        if (lower.includes('/entity/') || lower.includes('/entities/'))
            return 'ENTITY';
        if (lower.includes('/model/') || basename.endsWith('dto.java') || basename.endsWith('request.java') || basename.endsWith('response.java'))
            return 'DTO';
        if (lower.includes('/service/') && basename.endsWith('service.java'))
            return 'SERVICE';
        if (lower.includes('application.properties') || lower.includes('application.yml') || basename === 'pom.xml')
            return 'CONFIG';
        if (basename.endsWith('.java'))
            return 'SERVICE';
        return 'UNKNOWN';
    }
    mapStatus(status) {
        if (status.startsWith('A'))
            return 'added';
        if (status.startsWith('D'))
            return 'deleted';
        return 'modified';
    }
    /**
     * Get git log for recent commits.
     */
    getRecentCommits(count = 10) {
        try {
            const output = (0, child_process_1.execSync)(`git log --oneline -${count} --format="%H|%s|%an|%ai"`, {
                cwd: this.repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            return output.split('\n').filter(Boolean).map(line => {
                const [hash, message, author, date] = line.split('|');
                return { hash, message, author, date };
            });
        }
        catch {
            return [];
        }
    }
    /**
     * Check if given commit hash is valid.
     */
    isValidCommit(hash) {
        try {
            (0, child_process_1.execSync)(`git rev-parse --verify ${hash}`, {
                cwd: this.repoPath,
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.GitAnalyzer = GitAnalyzer;
//# sourceMappingURL=GitAnalyzer.js.map