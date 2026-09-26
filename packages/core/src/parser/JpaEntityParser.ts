import * as fs from 'fs';
import * as path from 'path';
import { DatabaseTable, DatabaseColumn, DatabaseRelationship } from '../models/types';

/**
 * Parses Spring/JPA entity classes to extract database schema information.
 */
export class JpaEntityParser {
  /**
   * Parse all JPA entities in a service directory.
   */
  parseService(serviceRoot: string): DatabaseTable[] {
    const tables: DatabaseTable[] = [];
    const javaFiles = this.findJavaFiles(serviceRoot);

    for (const file of javaFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (this.isJpaEntity(content)) {
          const table = this.parseEntity(file, content);
          if (table) tables.push(table);
        }
      } catch {
        // skip
      }
    }

    return tables;
  }

  private isJpaEntity(content: string): boolean {
    return /@Entity/.test(content);
  }

  private parseEntity(filePath: string, content: string): DatabaseTable | null {
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

  private extractTableName(content: string, className: string): string {
    // @Table(name = "orders") or @Table("orders")
    const m = content.match(/@Table\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/);
    if (m) return m[1];

    // Convert class name to snake_case
    return className
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  private extractColumns(content: string): DatabaseColumn[] {
    const columns: DatabaseColumn[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Look for field declarations with @Column or @Id
      const hasId = lines.slice(Math.max(0, i - 3), i + 1).some(l => /@Id/.test(l));
      const columnAnnotation = lines
        .slice(Math.max(0, i - 3), i + 1)
        .find(l => /@Column/.test(l));

      // Parse field line: e.g. private UUID id; or private Integer customerId;
      const fieldMatch = line.match(
        /(?:private|protected|public)\s+([\w<>]+(?:\[\])?)\s+(\w+)\s*(?:=.*)?;/
      );

      if (!fieldMatch) continue;

      const [, javaType, fieldName] = fieldMatch;

      // Skip non-column fields (relationships are handled separately)
      if (
        /@ManyToOne|@OneToMany|@ManyToMany|@OneToOne/.test(
          lines.slice(Math.max(0, i - 3), i + 1).join(' ')
        )
      ) {
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

  private extractColumnName(annotation: string | undefined, fieldName: string): string {
    if (annotation) {
      const m = annotation.match(/@Column\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/);
      if (m) return m[1];
    }

    // Convert camelCase to snake_case
    return fieldName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  private javaTypeToSql(javaType: string): string {
    const typeMap: Record<string, string> = {
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

  private extractRelationships(content: string, entityClass: string): DatabaseRelationship[] {
    const relationships: DatabaseRelationship[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      let relType: DatabaseRelationship['type'] | null = null;
      if (/@ManyToOne/.test(line)) relType = 'ManyToOne';
      else if (/@OneToMany/.test(line)) relType = 'OneToMany';
      else if (/@ManyToMany/.test(line)) relType = 'ManyToMany';
      else if (/@OneToOne/.test(line)) relType = 'OneToOne';

      if (!relType) continue;

      // Look at the next few lines for the field declaration
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const fieldLine = lines[j].trim();
        const fieldMatch = fieldLine.match(
          /(?:private|protected|public)\s+(?:List|Set|Collection)?<?(\w+)>?\s+(\w+)\s*[;=]/
        );
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

  private findJavaFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      const walk = (current: string) => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (['target', '.git', 'node_modules', 'test'].includes(entry.name)) continue;
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.name.endsWith('.java')) {
            results.push(full);
          }
        }
      };
      walk(dir);
    } catch {
      // ignore
    }
    return results;
  }
}
