import { execFileSync, execSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
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
    if (!this.isValidCommit(oldCommit) || !this.isValidCommit(newCommit)) return [];
    try {
      const tokens = execFileSync('git', ['diff', '--name-status', '-z', oldCommit, newCommit, '--'], {
        cwd: this.repoPath, encoding: 'utf8', env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}, stdio: ['ignore', 'pipe', 'pipe'],
      }).split('\0');
      const result: ChangedFile[] = [];
      for (let i = 0; i < tokens.length - 1;) {
        const status = tokens[i++];
        const file = tokens[i++];
        if (/^[RC]/.test(status)) {
          if (status[0] === 'R') result.push({path: file, category: this.classifyFile(file), changeType: 'deleted'});
          const target = tokens[i++];
          result.push({path: target, category: this.classifyFile(target), changeType: 'added'});
        } else result.push({path: file, category: this.classifyFile(file), changeType: this.mapStatus(status)});
      }
      return result;
    } catch { return []; }
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

    if (basename.endsWith('.php')) return 'SERVICE';
    if (/^(?:docker-)?compose\.ya?ml$/.test(basename) || basename === 'dockerfile') return 'CONFIG';
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
    if (!/^[a-f0-9]{7,40}$/.test(hash)) return false;
    try {
      execFileSync('git', ['cat-file', '-e', `${hash}^{commit}`], {cwd: this.repoPath, stdio: 'ignore'});
      return true;
    } catch { return false; }
  }

  readFileAt(commit: string, file: string): string {
    if (!this.isValidCommit(commit)) return '';
    try { return execFileSync('git', ['show', `${commit}:${file}`], {cwd: this.repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}); }
    catch { return ''; }
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
  getDirtyHash(ignorePaths: string[] = [], scope?: string): string {
    const parts = this.getDirtyFiles(ignorePaths).filter(f => !scope || this.within(path.resolve(this.repoPath, f.path), scope)).map(f => {
      let content = '';
      try { content = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(this.repoPath, f.path))).digest('hex'); } catch { /* deleted */ }
      return `${f.changeType}:${f.path}:${content}`;
    });
    return parts.length ? crypto.createHash('sha256').update(parts.sort().join('\0')).digest('hex').slice(0, 20) : 'clean';
  }

  private within(file: string, dir: string): boolean {
    const rel = path.relative(path.resolve(dir), file);
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
  }

  getDirtyFiles(ignorePaths: string[] = []): ChangedFile[] {
    try {
      const tokens = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
        cwd: this.repoPath, encoding: 'utf8', env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}, stdio: ['ignore', 'pipe', 'pipe'],
      }).split('\0');
      const results: ChangedFile[] = [];
      for (let i = 0; i < tokens.length - 1; i++) {
        const xy = tokens[i].slice(0, 2), file = tokens[i].slice(3);
        if (/[RC]/.test(xy)) {
          const old = tokens[++i];
          if (xy.includes('R')) results.push({path: old, category: this.classifyFile(old), changeType: 'deleted'});
        }
        results.push({path: file, category: this.classifyFile(file), changeType: xy.includes('D') ? 'deleted' : /[A?RC]/.test(xy) ? 'added' : 'modified'});
      }
      return results.filter(f => !f.path.split('/').includes('.context-graph-cache') && !ignorePaths.some(dir => this.within(path.resolve(this.repoPath, f.path), dir)));
    } catch { return []; }
  }
}
