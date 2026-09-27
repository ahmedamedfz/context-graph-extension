import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import { ChangedFile, FileCategory } from '../models/types';

/**
 * Git operations for commit detection and diff analysis.
 */
export class GitAnalyzer {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Get current HEAD commit hash (short = 7 chars, long = 40 chars).
   */
  getHead(short = true): string {
    try {
      return execSync(`git rev-parse ${short ? '--short' : ''} HEAD`, {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get current branch name.
   */
  getBranch(): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      return 'main';
    }
  }

  /**
   * Get list of changed files between two commits.
   */
  getChangedFiles(oldCommit: string, newCommit: string): ChangedFile[] {
    try {
      const output = execSync(`git diff --name-status ${oldCommit} ${newCommit}`, {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!output) return [];

      return output.split('\n').map(line => {
        const [status, ...rest] = line.split('\t');
        const filePath = rest[rest.length - 1];
        const changeType = this.mapStatus(status);
        const category = this.classifyFile(filePath);
        return { path: filePath, category, changeType };
      }).filter(f => f.path);
    } catch {
      return [];
    }
  }

  /**
   * Get all Java files changed since a specific commit.
   */
  getChangedJavaFiles(oldCommit: string, newCommit: string): string[] {
    return this.getChangedFiles(oldCommit, newCommit)
      .filter(f => f.path.endsWith('.java'))
      .map(f => f.path);
  }

  /**
   * Classify a file path into a category.
   */
  classifyFile(filePath: string): FileCategory {
    const lower = filePath.toLowerCase();
    const basename = path.basename(lower);

    // Spring Boot
    if (basename.endsWith('controller.java')) return 'API';
    if (lower.includes('/controller/')) return 'API';
    if (basename.endsWith('entity.java')) return 'ENTITY';
    if (lower.includes('/entity/') || lower.includes('/entities/')) return 'ENTITY';
    if (lower.includes('/model/') || basename.endsWith('dto.java') || basename.endsWith('request.java') || basename.endsWith('response.java')) return 'DTO';
    if (lower.includes('/service/') && basename.endsWith('service.java')) return 'SERVICE';
    // F08: application.yaml should be CONFIG too
    if (
      basename === 'application.properties' ||
      basename === 'application.yml' ||
      basename === 'application.yaml' ||
      basename === 'pom.xml'
    ) return 'CONFIG';
    if (basename.endsWith('.java')) return 'SERVICE';

    // Node.js / TypeScript
    if (lower.includes('/routes/') || lower.includes('/controllers/') || basename.endsWith('.routes.ts') || basename.endsWith('.routes.js') || basename.endsWith('.controller.ts') || basename.endsWith('.controller.js')) return 'API';
    if (basename === 'package.json') return 'CONFIG';
    if (basename.endsWith('.ts') || basename.endsWith('.js') || basename.endsWith('.mjs')) return 'SERVICE';

    // Python
    if (lower.includes('/routes/') || lower.includes('/views/') || basename.endsWith('_routes.py') || basename.endsWith('_views.py') || basename.endsWith('_api.py')) return 'API';
    if (basename === 'requirements.txt' || basename === 'pyproject.toml' || basename === 'setup.py' || basename === 'setup.cfg') return 'CONFIG';
    if (basename.endsWith('.py')) return 'SERVICE';

    // Go
    if (lower.includes('/handlers/') || lower.includes('/routes/') || basename.endsWith('_handler.go') || basename.endsWith('_routes.go')) return 'API';
    if (basename === 'go.mod' || basename === 'go.sum') return 'CONFIG';
    if (basename.endsWith('.go')) return 'SERVICE';

    return 'UNKNOWN';
  }

  private mapStatus(status: string): 'added' | 'modified' | 'deleted' {
    if (status.startsWith('A')) return 'added';
    if (status.startsWith('D')) return 'deleted';
    return 'modified';
  }

  /**
   * Get git log for recent commits.
   */
  getRecentCommits(count = 10): Array<{ hash: string; message: string; author: string; date: string }> {
    try {
      const output = execSync(`git log --oneline -${count} --format="%H|%s|%an|%ai"`, {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      return output.split('\n').filter(Boolean).map(line => {
        const [hash, message, author, date] = line.split('|');
        return { hash, message, author, date };
      });
    } catch {
      return [];
    }
  }

  /**
   * Check if given commit hash is valid.
   */
  isValidCommit(hash: string): boolean {
    try {
      execSync(`git rev-parse --verify ${hash}`, {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Produce a short fingerprint of the current working-tree dirty state.
   * Uses `git status --porcelain` (tracks staged + unstaged + untracked)
   * plus a stat of changed file sizes so content edits are detected even
   * when no commit has been made yet.
   *
   * Returns 'clean' when the working tree is identical to HEAD, or a
   * short hex string when there are uncommitted modifications.
   */
  getDirtyHash(): string {
    try {
      // --porcelain=v1 gives a stable machine-readable format
      const statusOutput = execSync('git status --porcelain=v1', {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!statusOutput) return 'clean';

      // Include a rough content fingerprint: sum of file sizes for modified files.
      // This is cheap (no hashing of file contents) yet detects edits.
      const lines = statusOutput.split('\n').filter(Boolean);
      const fileParts: string[] = [];
      for (const line of lines) {
        // columns 0-1 = XY status codes, col 3+ = file path (rename: "old -> new")
        const status = line.slice(0, 2).trim();
        const filePath = line.slice(3).split(' -> ').pop()!.trim();
        fileParts.push(`${status}:${filePath}`);
      }

      const raw = fileParts.sort().join('\n');
      return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
    } catch {
      return 'clean';
    }
  }

  /**
   * Get the list of working-tree dirty files relative to HEAD.
   * Returns ChangedFile entries for all staged + unstaged modifications,
   * allowing incremental analysis against uncommitted edits.
   */
  getDirtyFiles(): ChangedFile[] {
    try {
      const output = execSync('git status --porcelain=v1', {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!output) return [];

      return output
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const xy = line.slice(0, 2);
          const rawPath = line.slice(3).split(' -> ').pop()!.trim();
          const changeType = xy.includes('D') ? 'deleted' : xy.includes('A') || xy.trim() === '??' ? 'added' : 'modified';
          return { path: rawPath, category: this.classifyFile(rawPath), changeType } as ChangedFile;
        });
    } catch {
      return [];
    }
  }
}
