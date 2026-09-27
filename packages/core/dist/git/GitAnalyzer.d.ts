import { ChangedFile, FileCategory } from '../models/types';
/**
 * Git operations for commit detection and diff analysis.
 */
export declare class GitAnalyzer {
    private repoPath;
    constructor(repoPath: string);
    /**
     * Get current HEAD commit hash (short = 7 chars, long = 40 chars).
     */
    getHead(short?: boolean): string;
    /**
     * Get current branch name.
     */
    getBranch(): string;
    /**
     * Get list of changed files between two commits.
     */
    getChangedFiles(oldCommit: string, newCommit: string): ChangedFile[];
    /**
     * Get all Java files changed since a specific commit.
     */
    getChangedJavaFiles(oldCommit: string, newCommit: string): string[];
    /**
     * Classify a file path into a category.
     */
    classifyFile(filePath: string): FileCategory;
    private mapStatus;
    /**
     * Get git log for recent commits.
     */
    getRecentCommits(count?: number): Array<{
        hash: string;
        message: string;
        author: string;
        date: string;
    }>;
    /**
     * Check if given commit hash is valid.
     */
    isValidCommit(hash: string): boolean;
    /**
     * Produce a short fingerprint of the current working-tree dirty state.
     * Uses `git status --porcelain` (tracks staged + unstaged + untracked)
     * plus a stat of changed file sizes so content edits are detected even
     * when no commit has been made yet.
     *
     * Returns 'clean' when the working tree is identical to HEAD, or a
     * short hex string when there are uncommitted modifications.
     */
    getDirtyHash(): string;
    /**
     * Get the list of working-tree dirty files relative to HEAD.
     * Returns ChangedFile entries for all staged + unstaged modifications,
     * allowing incremental analysis against uncommitted edits.
     */
    getDirtyFiles(): ChangedFile[];
}
//# sourceMappingURL=GitAnalyzer.d.ts.map