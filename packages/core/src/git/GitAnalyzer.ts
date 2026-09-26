import { execSync } from 'child_process';
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

    if (basename.endsWith('controller.java')) return 'API';
    if (lower.includes('/controller/')) return 'API';
    if (basename.endsWith('entity.java')) return 'ENTITY';
    if (lower.includes('/entity/') || lower.includes('/entities/')) return 'ENTITY';
    if (lower.includes('/model/') || basename.endsWith('dto.java') || basename.endsWith('request.java') || basename.endsWith('response.java')) return 'DTO';
    if (lower.includes('/service/') && basename.endsWith('service.java')) return 'SERVICE';
    if (lower.includes('application.properties') || lower.includes('application.yml') || basename === 'pom.xml') return 'CONFIG';
    if (basename.endsWith('.java')) return 'SERVICE';
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
}
