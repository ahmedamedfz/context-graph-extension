import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint } from '../models/types';

/**
 * Extracts REST API endpoints from Python services.
 * Supports Flask and FastAPI route decorators.
 */
export class PythonApiParser {
  parseService(serviceRoot: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const pyFiles = this.findPyFiles(serviceRoot);

    for (const file of pyFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const fileEndpoints = this.parseFile(file, content);
        endpoints.push(...fileEndpoints);
      } catch {
        // skip unreadable files
      }
    }

    return endpoints;
  }

  private parseFile(filePath: string, content: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const filename = path.basename(filePath, '.py');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Flask: @app.route('/path', methods=['GET', 'POST'])
      // or @blueprint.route('/path')
      const flaskRouteMatch = line.match(/@(?:\w+)\.route\s*\(\s*['"]([^'"]+)['"]/);
      if (flaskRouteMatch) {
        const routePath = flaskRouteMatch[1];
        // Extract methods from the same line or next few lines
        const methodsMatch = lines.slice(i, i + 3).join(' ').match(/methods\s*=\s*\[([^\]]+)\]/);
        const methods: string[] = methodsMatch
          ? methodsMatch[1].match(/['"](\w+)['"]/g)?.map(m => m.replace(/['"]/g, '')) ?? ['GET']
          : ['GET'];

        for (const method of methods) {
          if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
            endpoints.push({
              method: method.toUpperCase() as ApiEndpoint['method'],
              path: routePath,
              controller: filename,
              handlerMethod: this.extractFunctionName(lines, i + 1),
            });
          }
        }
        continue;
      }

      // FastAPI: @app.get('/path'), @router.post('/path')
      const fastApiMatch = line.match(/@(?:\w+)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (fastApiMatch) {
        const method = fastApiMatch[1].toUpperCase() as ApiEndpoint['method'];
        const routePath = fastApiMatch[2];
        endpoints.push({
          method,
          path: routePath,
          controller: filename,
          handlerMethod: this.extractFunctionName(lines, i + 1),
        });
      }
    }

    return endpoints;
  }

  private extractFunctionName(lines: string[], startIdx: number): string {
    for (let i = startIdx; i < Math.min(startIdx + 3, lines.length); i++) {
      const match = lines[i].trim().match(/^(?:async\s+)?def\s+(\w+)/);
      if (match) return match[1];
    }
    return 'handler';
  }

  private findPyFiles(dir: string): string[] {
    const results: string[] = [];
    const SKIP = new Set(['.git', '__pycache__', '.venv', 'venv', 'env', 'node_modules', 'dist', 'build', '.pytest_cache']);
    try {
      const walk = (current: string) => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (SKIP.has(entry.name)) continue;
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.name.endsWith('.py')) {
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
