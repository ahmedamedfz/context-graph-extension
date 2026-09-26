import { ApiEndpoint } from '../models/types';
/**
 * Parses Spring Boot Java source files to extract REST API endpoints.
 * Uses regex-based parsing (no full Java AST required for hackathon).
 */
export declare class SpringApiParser {
    /**
     * Parse all Java files in a service directory and extract endpoints.
     */
    parseService(serviceRoot: string): ApiEndpoint[];
    private isRestController;
    private parseController;
    private extractClassMapping;
    private extractHandlerMethods;
    private extractAnnotationPath;
    private extractRequestMappingMethod;
    private extractMethodSignature;
    private extractResponseType;
    private extractRequestBodyType;
    private cleanGenericType;
    private joinPaths;
    private findJavaFiles;
}
//# sourceMappingURL=SpringApiParser.d.ts.map