"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.JpaEntityParser = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Parses Spring/JPA entity classes to extract database schema information.
 */
class JpaEntityParser {
    /**
     * Parse all JPA entities in a service directory.
     */
    parseService(serviceRoot) {
        const tables = [];
        const javaFiles = this.findJavaFiles(serviceRoot);
        for (const file of javaFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                if (this.isJpaEntity(content)) {
                    const table = this.parseEntity(file, content);
                    if (table)
                        tables.push(table);
                }
            }
            catch {
                // skip
            }
        }
        return tables;
    }
    isJpaEntity(content) {
        return /@Entity/.test(content);
    }
    parseEntity(filePath, content) {
        const className = path.basename(filePath, '.java');
        // Determine table name
        const tableName = this.extractTableName(content, className);
        // Extract columns
        const columns = this.extractColumns(content);
        // Extract relationships
        const relationships = this.extractRelationships(content, className);
        return {
            tableName,
            entityClass: className,
            columns,
            relationships,
        };
    }
    extractTableName(content, className) {
        // @Table(name = "orders") or @Table("orders")
        const m = content.match(/@Table\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/);
        if (m)
            return m[1];
        // Convert class name to snake_case
        return className
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '');
    }
    extractColumns(content) {
        const columns = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Look for field declarations with @Column or @Id
            const hasId = lines.slice(Math.max(0, i - 3), i + 1).some(l => /@Id/.test(l));
            const columnAnnotation = lines
                .slice(Math.max(0, i - 3), i + 1)
                .find(l => /@Column/.test(l));
            // Parse field line: e.g. private UUID id; or private Integer customerId;
            const fieldMatch = line.match(/(?:private|protected|public)\s+([\w<>]+(?:\[\])?)\s+(\w+)\s*(?:=.*)?;/);
            if (!fieldMatch)
                continue;
            const [, javaType, fieldName] = fieldMatch;
            // Skip non-column fields (relationships are handled separately)
            if (/@ManyToOne|@OneToMany|@ManyToMany|@OneToOne/.test(lines.slice(Math.max(0, i - 3), i + 1).join(' '))) {
                continue;
            }
            // Skip collections that aren't direct columns
            if (javaType.startsWith('List') || javaType.startsWith('Set') || javaType.startsWith('Collection')) {
                continue;
            }
            const isPrimaryKey = hasId || fieldName === 'id';
            const columnName = this.extractColumnName(columnAnnotation, fieldName);
            const sqlType = this.javaTypeToSql(javaType);
            const isNullable = !isPrimaryKey && !(columnAnnotation && /nullable\s*=\s*false/.test(columnAnnotation));
            columns.push({
                name: columnName,
                type: sqlType,
                isPrimaryKey,
                isNullable,
                javaType,
            });
        }
        return columns;
    }
    extractColumnName(annotation, fieldName) {
        if (annotation) {
            const m = annotation.match(/@Column\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/);
            if (m)
                return m[1];
        }
        // Convert camelCase to snake_case
        return fieldName
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '');
    }
    javaTypeToSql(javaType) {
        const typeMap = {
            'String': 'VARCHAR',
            'Integer': 'INTEGER',
            'int': 'INTEGER',
            'Long': 'BIGINT',
            'long': 'BIGINT',
            'Double': 'DOUBLE',
            'double': 'DOUBLE',
            'Float': 'FLOAT',
            'float': 'FLOAT',
            'Boolean': 'BOOLEAN',
            'boolean': 'BOOLEAN',
            'UUID': 'UUID',
            'LocalDate': 'DATE',
            'LocalDateTime': 'TIMESTAMP',
            'Date': 'TIMESTAMP',
            'BigDecimal': 'DECIMAL',
            'byte[]': 'BYTEA',
        };
        return typeMap[javaType] || javaType.toUpperCase();
    }
    extractRelationships(content, entityClass) {
        const relationships = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            let relType = null;
            if (/@ManyToOne/.test(line))
                relType = 'ManyToOne';
            else if (/@OneToMany/.test(line))
                relType = 'OneToMany';
            else if (/@ManyToMany/.test(line))
                relType = 'ManyToMany';
            else if (/@OneToOne/.test(line))
                relType = 'OneToOne';
            if (!relType)
                continue;
            // Look at the next few lines for the field declaration
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                const fieldLine = lines[j].trim();
                const fieldMatch = fieldLine.match(/(?:private|protected|public)\s+(?:List|Set|Collection)?<?(\w+)>?\s+(\w+)\s*[;=]/);
                if (fieldMatch) {
                    relationships.push({
                        type: relType,
                        fromEntity: entityClass,
                        toEntity: fieldMatch[1],
                        fieldName: fieldMatch[2],
                    });
                    break;
                }
            }
        }
        return relationships;
    }
    findJavaFiles(dir) {
        const results = [];
        try {
            const walk = (current) => {
                const entries = fs.readdirSync(current, { withFileTypes: true });
                for (const entry of entries) {
                    if (['target', '.git', 'node_modules', 'test'].includes(entry.name))
                        continue;
                    const full = path.join(current, entry.name);
                    if (entry.isDirectory()) {
                        walk(full);
                    }
                    else if (entry.name.endsWith('.java')) {
                        results.push(full);
                    }
                }
            };
            walk(dir);
        }
        catch {
            // ignore
        }
        return results;
    }
}
exports.JpaEntityParser = JpaEntityParser;
//# sourceMappingURL=JpaEntityParser.js.map