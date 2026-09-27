import { DiscoveredService } from '../models/types';
/**
 * Discovers microservice directories within a workspace root.
 * Supports Spring Boot (pom.xml / build.gradle), Node.js (package.json),
 * Python (requirements.txt / pyproject.toml / setup.py / setup.cfg),
 * and Go (go.mod) projects.
 */
export declare class WorkspaceScanner {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    discoverServices(): Promise<DiscoveredService[]>;
    /**
     * Compute a cheap fingerprint of the workspace's service-discovery topology.
     * Hashes the relative paths and sizes of all marker files (pom.xml,
     * package.json, go.mod, etc.) found up to MAX_DEPTH. When this value is
     * the same as what is stored in the cache, service discovery can be skipped
     * entirely and the cached service list reused.
     *
     * No file content is read — only stat() calls, so it is very fast.
     */
    getWorkspaceFingerprint(): string;
    private collectMarkerFiles;
    private findServiceDirectories;
    /**
     * Detect the technology stack of a directory.
     */
    detectStack(dir: string): DiscoveredService['detectedStack'];
    /**
     * A Maven aggregator has a pom.xml with <modules> and typically packaging=pom
     * and NO src/main directory (no actual service code).
     */
    private isMavenAggregator;
    /**
     * Extract module names from a Maven aggregator pom.xml.
     */
    private getMavenModules;
    private tryReadFile;
    private analyzeDirectory;
    /**
     * F09: Generate a canonical, unique service ID.
     * Uses the workspace-relative path with segments separated by '/' so that
     * `team-a/order-service` and `team/a-order-service` produce different IDs.
     *
     * Format: `<segment1>/<segment2>/.../<leafName>` — slashes are preserved so
     * the path structure remains unambiguous. Each segment is sanitized to
     * lowercase alphanumeric + hyphens.
     */
    generateServiceId(dirPath: string, repository?: string): string;
    countFiles(dirPath: string, extensions?: string[]): number;
}
//# sourceMappingURL=WorkspaceScanner.d.ts.map