import { ServiceDependency } from '../models/types';
/**
 * Detects dependencies between Spring Boot services by analyzing:
 * - RestTemplate / WebClient / FeignClient calls
 * - Service references in application.properties/yml
 * - Import patterns
 */
export declare class DependencyAnalyzer {
    /**
     * Detect service dependencies from source code.
     * @param serviceRoot - Root directory of the service being analyzed
     * @param knownServices - IDs of other known services in the workspace
     */
    analyzeDependencies(serviceRoot: string, knownServices: string[]): ServiceDependency[];
    private findRestClientDependencies;
    private findConfigDependencies;
    /**
     * Detect which databases a service uses based on configuration and entity presence.
     */
    detectDatabaseUsage(serviceRoot: string): string[];
    private findJavaFiles;
}
//# sourceMappingURL=DependencyAnalyzer.d.ts.map