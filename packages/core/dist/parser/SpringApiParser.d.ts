import { ApiEndpoint } from '../models/types';
/**
 * Parses Spring Boot Java source files to extract REST API endpoints.
 * Uses regex-based parsing with multiline annotation support.
 *
 * F15 fixes:
 * - Handle path= alias in @RequestMapping (not just value=)
 * - Handle @RequestBody on a following line (multiline signatures)
 * - Correctly parse nested generics like ResponseEntity<List<OrderResponse>>
 * - Handle array-style @RequestMapping(value={"/v1"})
 */
export declare class SpringApiParser {
    /**
     * Parse all Java files in a service directory and extract endpoints.
     */
    parseService(serviceRoot: string): ApiEndpoint[];
    private isRestController;
    private parseController;
    /**
     * F15: Extract class-level @RequestMapping, supporting both value= and path= aliases.
     * Also handles array syntax: @RequestMapping({"/v1"}) or @RequestMapping(path={"/v1", "/api/v1"})
     */
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