import { DiscoveredService } from '../models/types';
/**
 * Discovers microservice directories within a workspace root.
 * Looks for directories containing pom.xml or build.gradle (Spring Boot indicators).
 */
export declare class WorkspaceScanner {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    discoverServices(): Promise<DiscoveredService[]>;
    private findServiceDirectories;
    private isServiceDirectory;
    private analyzeDirectory;
    private isSpringBootService;
    generateServiceId(dirPath: string): string;
    countFiles(dirPath: string, extensions?: string[]): number;
}
//# sourceMappingURL=WorkspaceScanner.d.ts.map