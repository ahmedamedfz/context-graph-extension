import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint } from '../models/types';

/**
 * Extracts REST API endpoints from Go services.
 * Supports net/http ServeMux, gorilla/mux, gin, echo, and chi patterns.
 */
export class GoApiParser {
  parseService(serviceRoot: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const goFiles = this.findGoFiles(serviceRoot);

    for (const file of goFiles) {
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
    const filename = path.basename(filePath, '.go');

    // net/http: http.HandleFunc("/path", handler) or mux.HandleFunc
    const httpHandlePattern = /(?:http|mux|r|router|srv)\s*\.\s*HandleFunc\s*\(\s*["']([^"']+)["']/g;
    let match;
    while ((match = httpHandlePattern.exec(content)) !== null) {
      const route = match[1].match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) (.+)$/);
      const start = match.index;
      const next = content.indexOf('.HandleFunc', start + match[0].length);
      const body = content.slice(start, next === -1 ? undefined : next);
      const methods = route ? [route[1]] : [...body.matchAll(/case\s+"(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)"/g)].map(m => m[1]);
      for (const method of methods.length ? methods : ['ANY']) endpoints.push({
        method: method as ApiEndpoint['method'], path: route?.[2] ?? match[1], controller: filename, handlerMethod: 'handleFunc',
      });
    }

    // gorilla/mux: r.HandleFunc("/path", handler).Methods("GET", "POST")
    const gorillaMuxPattern = /\.HandleFunc\s*\(\s*["']([^"']+)["']\s*,\s*\w+\s*\)\s*\.Methods\s*\(([^)]+)\)/g;
    while ((match = gorillaMuxPattern.exec(content)) !== null) {
      const routePath = match[1];
      const methodsStr = match[2];
      const methods = methodsStr.match(/["'](\w+)["']/g)?.map(m => m.replace(/['"]/g, '')) ?? [];
      for (const method of methods) {
        if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
          endpoints.push({
            method: method.toUpperCase() as ApiEndpoint['method'],
            path: routePath,
            controller: filename,
            handlerMethod: 'gorillaMux',
          });
        }
      }
    }

    // gin: r.GET("/path", handler), r.POST("/path", handler), etc.
    const ginPattern = /(?:r|router|g|group)\s*\.\s*(GET|POST|PUT|DELETE|PATCH)\s*\(\s*["']([^"']+)["']/g;
    while ((match = ginPattern.exec(content)) !== null) {
      const method = match[1].toUpperCase() as ApiEndpoint['method'];
      const routePath = match[2];
      endpoints.push({
        method,
        path: routePath,
        controller: filename,
        handlerMethod: 'gin',
      });
    }

    // echo: e.GET("/path", handler), e.POST("/path", handler), etc.
    const echoPattern = /(?:e|echo|api)\s*\.\s*(GET|POST|PUT|DELETE|PATCH)\s*\(\s*["']([^"']+)["']/g;
    while ((match = echoPattern.exec(content)) !== null) {
      const method = match[1].toUpperCase() as ApiEndpoint['method'];
      const routePath = match[2];
      endpoints.push({
        method,
        path: routePath,
        controller: filename,
        handlerMethod: 'echo',
      });
    }

    // chi: r.Method("GET", "/path", handler)
    const chiMethodPattern = /r\s*\.\s*Method\s*\(\s*["'](\w+)["']\s*,\s*["']([^"']+)["']/g;
    while ((match = chiMethodPattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        endpoints.push({
          method: method as ApiEndpoint['method'],
          path: match[2],
          controller: filename,
          handlerMethod: 'chi',
        });
      }
    }

    return endpoints;
  }

  private findGoFiles(dir: string): string[] {
    const results: string[] = [];
    const SKIP = new Set(['.git', 'vendor', 'node_modules', 'dist', 'build']);
    try {
      const walk = (current: string) => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (SKIP.has(entry.name)) continue;
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.name.endsWith('.go') && !entry.name.endsWith('_test.go')) {
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
