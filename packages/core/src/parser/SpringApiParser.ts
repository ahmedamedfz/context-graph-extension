import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint } from '../models/types';

/**
 * Parses Spring Boot Java source files to extract REST API endpoints.
 * Uses regex-based parsing (no full Java AST required for hackathon).
 */
export class SpringApiParser {
  /**
   * Parse all Java files in a service directory and extract endpoints.
   */
  parseService(serviceRoot: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const javaFiles = this.findJavaFiles(serviceRoot);

    for (const file of javaFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (this.isRestController(content)) {
          const fileEndpoints = this.parseController(file, content);
          endpoints.push(...fileEndpoints);
        }
      } catch {
        // skip unreadable files
      }
    }

    return endpoints;
  }

  private isRestController(content: string): boolean {
    return /@RestController/.test(content) || /@Controller/.test(content);
  }

  private parseController(filePath: string, content: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const controllerName = path.basename(filePath, '.java');

    // Extract class-level @RequestMapping
    const classMapping = this.extractClassMapping(content);

    // Extract all handler methods
    const lines = content.split('\n');
    const methods = this.extractHandlerMethods(lines, classMapping, controllerName);
    endpoints.push(...methods);

    return endpoints;
  }

  private extractClassMapping(content: string): string {
    const match = content.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
    return match ? match[1] : '';
  }

  private extractHandlerMethods(
    lines: string[],
    classPath: string,
    controllerName: string
  ): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const httpMethodAnnotations = [
      { pattern: /@GetMapping/, method: 'GET' as const },
      { pattern: /@PostMapping/, method: 'POST' as const },
      { pattern: /@PutMapping/, method: 'PUT' as const },
      { pattern: /@DeleteMapping/, method: 'DELETE' as const },
      { pattern: /@PatchMapping/, method: 'PATCH' as const },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      for (const { pattern, method } of httpMethodAnnotations) {
        if (!pattern.test(line)) continue;

        // Extract path from annotation
        const annotationPath = this.extractAnnotationPath(line, lines, i);
        const fullPath = this.joinPaths(classPath, annotationPath);

        // Look ahead for method signature
        const methodInfo = this.extractMethodSignature(lines, i);

        endpoints.push({
          method,
          path: fullPath || '/',
          controller: controllerName,
          handlerMethod: methodInfo.name,
          requestModel: methodInfo.requestModel,
          responseModel: methodInfo.responseModel,
        });
        break;
      }

      // Also handle @RequestMapping on methods
      if (/@RequestMapping\s*\(/.test(line)) {
        const httpMethod = this.extractRequestMappingMethod(line);
        if (httpMethod) {
          const annotationPath = this.extractAnnotationPath(line, lines, i);
          const fullPath = this.joinPaths(classPath, annotationPath);
          const methodInfo = this.extractMethodSignature(lines, i);

          endpoints.push({
            method: httpMethod,
            path: fullPath || '/',
            controller: controllerName,
            handlerMethod: methodInfo.name,
            requestModel: methodInfo.requestModel,
            responseModel: methodInfo.responseModel,
          });
        }
      }
    }

    return endpoints;
  }

  private extractAnnotationPath(line: string, lines: string[], index: number): string {
    // Check current line for path in annotation
    let annotationText = line;

    // If annotation spans multiple lines, collect them
    if (line.includes('(') && !line.includes(')')) {
      for (let j = index + 1; j < Math.min(index + 5, lines.length); j++) {
        annotationText += ' ' + lines[j].trim();
        if (lines[j].includes(')')) break;
      }
    }

    // Try to extract path value
    const patterns = [
      /(?:value\s*=\s*)?["']([^"']+)["']/,
      /\{\s*["']([^"']+)["']/,
    ];

    for (const p of patterns) {
      const m = annotationText.match(p);
      if (m) return m[1];
    }

    return '';
  }

  private extractRequestMappingMethod(line: string): ApiEndpoint['method'] | null {
    const m = line.match(/method\s*=\s*RequestMethod\.(\w+)/);
    if (!m) return null;
    const method = m[1].toUpperCase();
    if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      return method as ApiEndpoint['method'];
    }
    return null;
  }

  private extractMethodSignature(
    lines: string[],
    annotationIndex: number
  ): { name: string; requestModel?: string; responseModel?: string } {
    // Look at lines after the annotation for the method signature
    for (let i = annotationIndex + 1; i < Math.min(annotationIndex + 10, lines.length); i++) {
      const line = lines[i].trim();

      // Skip other annotations
      if (line.startsWith('@')) continue;
      if (line.length === 0) continue;

      // Try to parse method signature
      // e.g.: public ResponseEntity<OrderResponse> createOrder(@RequestBody OrderRequest request)
      const methodMatch = line.match(
        /(?:public|protected|private)?\s+(?:[\w<>\[\],\s]+)\s+(\w+)\s*\(/
      );
      if (methodMatch) {
        const name = methodMatch[1];
        const responseModel = this.extractResponseType(line);
        const requestModel = this.extractRequestBodyType(line);
        return { name, requestModel, responseModel };
      }
    }

    return { name: 'unknown' };
  }

  private extractResponseType(methodLine: string): string | undefined {
    // ResponseEntity<Foo> or List<Foo> or Foo
    const m = methodLine.match(/ResponseEntity\s*<([^>]+)>/);
    if (m) return this.cleanGenericType(m[1]);

    const m2 = methodLine.match(/(?:public|protected|private)\s+([\w<>\[\]]+)\s+\w+\s*\(/);
    if (m2 && !['void', 'String', 'boolean', 'int', 'long'].includes(m2[1])) {
      return this.cleanGenericType(m2[1]);
    }

    return undefined;
  }

  private extractRequestBodyType(methodLine: string): string | undefined {
    const m = methodLine.match(/@RequestBody\s+(\w+)/);
    return m ? m[1] : undefined;
  }

  private cleanGenericType(type: string): string {
    return type.replace(/\s/g, '').trim();
  }

  private joinPaths(...parts: string[]): string {
    const joined = parts
      .filter(p => p)
      .join('/')
      .replace(/\/+/g, '/');
    return joined.startsWith('/') ? joined : '/' + joined;
  }

  private findJavaFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      const walk = (current: string) => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'target' || entry.name === '.git' || entry.name === 'node_modules') continue;
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
