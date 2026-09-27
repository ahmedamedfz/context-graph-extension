import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint } from '../models/types';

/** Small source-backed adapters for native Node HTTP, JDK HttpServer and PHP front controllers. */
export class NativeApiParser {
  parseService(root: string): ApiEndpoint[] {
    return sourceFiles(root).flatMap(file => this.parseFile(file, fs.readFileSync(file, 'utf8')));
  }
  parseFile(file: string, text: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const add = (route: string, method: string, offset: number) => {
      endpoints.push({path: route, method: method as ApiEndpoint['method'], controller: path.basename(file), handlerMethod: 'native-http', provenance: {file, line: text.slice(0, offset).split('\n').length, parser: 'native-http', confidence: method === 'ANY' ? 'partial' : 'observed'}});
    };
    if (/\.createServer\s*\(/.test(text)) {
      // Literal route tables consumed by a reverse proxy.
      for (const m of text.matchAll(/\[\s*["'](\/[^"']*)["']\s*,\s*["'][^"']+["']\s*,\s*["'][^"']+["']\s*,\s*\[([^\]]+)\]/g)) {
        for (const verb of m[2].matchAll(/["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["']/g)) add(m[1], verb[1], m.index!);
      }
      for (const m of text.matchAll(/(?:req\.url|url\.pathname)\s*===?\s*["'](\/[^"']*)["']([^\n{]*)/g)) {
        const method = m[2].match(/req\.method\s*===?\s*["'](\w+)["']/)?.[1] ?? 'ANY';
        add(m[1], method, m.index!);
      }
      // Static asset map in a native HTTP server.
      for (const m of text.matchAll(/["'](\/[^"']*)["']\s*:\s*\[\s*["'][^"']+["']\s*,\s*["'](?:text|application)\//g)) add(m[1], 'ANY', m.index!);
    }
    if (/HttpServer\.create|REQUEST_URI/.test(text)) {
      const pattern = /(?:\bpath\.equals\(\s*["'](\/[^"']*)["']\s*\)|\$path\s*[!=]==?\s*["'](\/[^"']*)["'])/g;
      const routes = [...text.matchAll(pattern)];
      routes.forEach((m, i) => {
        const segment = text.slice(m.index, routes[i + 1]?.index ?? text.length);
        const methods = [...segment.matchAll(/(?:getRequestMethod\(\)\.equals\(|REQUEST_METHOD['"]\]\s*[!=]==?)\s*["'](GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)["']/g)].map(v => v[1]);
        for (const method of methods.length ? methods : ['ANY']) add(m[1] ?? m[2], method, m.index!);
      });
    }
    return [...new Map(endpoints.map(a => [a.method + ':' + a.path, a])).values()];
  }
}
export function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', 'target', 'vendor', '__pycache__'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(java|php|js|ts|mjs|py|go)$/.test(entry.name)) files.push(full);
    }
  };
  walk(root);
  return files;
}
