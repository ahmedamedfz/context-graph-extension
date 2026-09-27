import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint } from '../models/types';

/**
 * Extracts REST API endpoints from Node.js/Express services.
 * Handles Express.js route patterns (app.get, app.post, router.get, etc.)
 * and basic Fastify route registration.
 */
export class NodeApiParser {
  parseService(serviceRoot: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const jsFiles = this.findJsFiles(serviceRoot);

    for (const file of jsFiles) {
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
    const filename = path.basename(filePath, path.extname(filePath));

    // Express: app.METHOD('/path', ...) or router.METHOD('/path', ...)
    const expressPattern = /(?:app|router)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match;
    while ((match = expressPattern.exec(content)) !== null) {
      const method = match[1].toUpperCase() as ApiEndpoint['method'];
      const routePath = match[2];
      endpoints.push({
        method,
        path: routePath,
        controller: filename,
        handlerMethod: 'anonymous',
      });
    }

    // Fastify: fastify.METHOD('/path', ...) or server.METHOD('/path', ...)
    const fastifyPattern = /(?:fastify|server)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    while ((match = fastifyPattern.exec(content)) !== null) {
      const method = match[1].toUpperCase() as ApiEndpoint['method'];
      const routePath = match[2];
      endpoints.push({
        method,
        path: routePath,
        controller: filename,
        handlerMethod: 'anonymous',
      });
    }

    // @nestjs/common decorators: @Get('/path'), @Post('/path')
    const nestPattern = /@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    while ((match = nestPattern.exec(content)) !== null) {
      const method = match[1].toUpperCase() as ApiEndpoint['method'];
      const routePath = match[2] || '/';
      endpoints.push({
        method,
        path: routePath,
        controller: filename,
        handlerMethod: 'nestjs-handler',
      });
    }

    return endpoints;
  }

  private findJsFiles(dir: string): string[] {
    const results: string[] = [];
    const SKIP = new Set(['node_modules', 'dist', 'build', '.git', 'test', 'tests', '__tests__', 'coverage']);
    try {
      const walk = (current: string) => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (SKIP.has(entry.name)) continue;
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts') || entry.name.endsWith('.mjs')) {
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
