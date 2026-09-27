import { DatabaseTable } from '../models/types';
/**
 * Parses Spring/JPA entity classes to extract database schema information.
 *
 * F16 fixes:
 * - Bind @Id/@Column/@Transient to the *exact next* field declaration, not a 3-line window
 * - Prevent annotation bleed from one field to an unrelated adjacent field
 * - Respect @Transient correctly
 */
export declare class JpaEntityParser {
    /**
     * Parse all JPA entities in a service directory.
     */
    parseService(serviceRoot: string): DatabaseTable[];
    private isJpaEntity;
    private parseEntity;
    private extractTableName;
    /**
     * F16: Walk through the class body line-by-line, accumulating annotations
     * into a "pending" set and attaching them to the VERY NEXT field declaration.
     * This prevents annotation bleed from one field to the next.
     */
    private extractColumns;
    private extractColumnName;
    private javaTypeToSql;
    private extractRelationships;
    private findJavaFiles;
}
//# sourceMappingURL=JpaEntityParser.d.ts.map