import { DatabaseTable } from '../models/types';
/**
 * Parses Spring/JPA entity classes to extract database schema information.
 */
export declare class JpaEntityParser {
    /**
     * Parse all JPA entities in a service directory.
     */
    parseService(serviceRoot: string): DatabaseTable[];
    private isJpaEntity;
    private parseEntity;
    private extractTableName;
    private extractColumns;
    private extractColumnName;
    private javaTypeToSql;
    private extractRelationships;
    private findJavaFiles;
}
//# sourceMappingURL=JpaEntityParser.d.ts.map