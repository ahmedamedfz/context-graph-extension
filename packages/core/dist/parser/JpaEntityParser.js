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
 *
 * F16 fixes:
 * - Bind @Id/@Column/@Transient to the *exact next* field declaration, not a 3-line window
 * - Prevent annotation bleed from one field to an unrelated adjacent field
 * - Respect @Transient correctly
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
        // Extract columns using the annotation-aware parser
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
    /**
     * F16: Walk through the class body line-by-line, accumulating annotations
     * into a "pending" set and attaching them to the VERY NEXT field declaration.
     * This prevents annotation bleed from one field to the next.
     */
    extractColumns(content) {
        const columns = [];
        const lines = content.split('\n');
        // Pending annotation state for the current block
        let pendingId = false;
        let pendingTransient = false;
        let pendingColumn = null;
        let pendingRelationship = false;
        for (const rawLine of lines) {
            const line = rawLine.trim();
            // Detect annotations — reset pending state for each NEW annotation block
            // (we treat consecutive annotation lines as one block)
            if (line.startsWith('@')) {
                if (/@Id\b/.test(line)) {
                    pendingId = true;
                }
                if (/@Transient\b/.test(line)) {
                    pendingTransient = true;
                }
                if (/@Column\b/.test(line)) {
                    pendingColumn = line;
                }
                if (/@ManyToOne|@OneToMany|@ManyToMany|@OneToOne/.test(line)) {
                    pendingRelationship = true;
                }
                // Keep scanning — next non-annotation, non-blank line is the field
                continue;
            }
            // Blank lines or method/class declarations reset the pending block
            if (line.length === 0 || line.startsWith('public class') || line.startsWith('private class')) {
                pendingId = false;
                pendingTransient = false;
                pendingColumn = null;
                pendingRelationship = false;
                continue;
            }
            // Try to match a field declaration
            const fieldMatch = line.match(/(?:private|protected|public)\s+([\w<>[\]]+)\s+(\w+)\s*(?:=.*)?;/);
            if (!fieldMatch) {
                // This line is not a field declaration — if it looks like a method, reset pending
                if (/(?:public|private|protected)\s+\w+\s+\w+\s*\(/.test(line)) {
                    pendingId = false;
                    pendingTransient = false;
                    pendingColumn = null;
                    pendingRelationship = false;
                }
                continue;
            }
            const [, javaType, fieldName] = fieldMatch;
            // Capture current pending state and reset it immediately
            const isId = pendingId;
            const isTransient = pendingTransient;
            const columnAnnotation = pendingColumn;
            const isRelationship = pendingRelationship;
            // Reset for next field
            pendingId = false;
            pendingTransient = false;
            pendingColumn = null;
            pendingRelationship = false;
            // F16: Skip @Transient fields
            if (isTransient)
                continue;
            // Skip relationship fields — handled separately
            if (isRelationship)
                continue;
            // Skip collection types that aren't direct columns
            if (javaType.startsWith('List') ||
                javaType.startsWith('Set') ||
                javaType.startsWith('Collection')) {
                continue;
            }
            const isPrimaryKey = isId || fieldName === 'id';
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
            if (/@ManyToOne\b/.test(line))
                relType = 'ManyToOne';
            else if (/@OneToMany\b/.test(line))
                relType = 'OneToMany';
            else if (/@ManyToMany\b/.test(line))
                relType = 'ManyToMany';
            else if (/@OneToOne\b/.test(line))
                relType = 'OneToOne';
            if (!relType)
                continue;
            // Look at the next non-annotation, non-blank lines for the field declaration
            for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                const fieldLine = lines[j].trim();
                if (fieldLine.startsWith('@') || fieldLine.length === 0)
                    continue;
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
                // Stop at a method declaration
                if (/(?:public|private|protected)\s+\w+\s+\w+\s*\(/.test(fieldLine))
                    break;
            }
        }
        return relationships;
    }
    findJavaFiles(dir) {
        const results = [];
        const SKIP = new Set(['target', '.git', 'node_modules', 'test', 'build', 'dist']);
        try {
            const walk = (current) => {
                const entries = fs.readdirSync(current, { withFileTypes: true });
                for (const entry of entries) {
                    if (SKIP.has(entry.name))
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