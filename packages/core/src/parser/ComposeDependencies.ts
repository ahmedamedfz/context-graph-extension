import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { ServiceDependency } from '../models/types';
import { sourceFiles } from './NativeApiParser';

/** Only explicit source URLs, proxy tables and service-specific environment URLs become edges. */
export function polyglotDependencies(root: string, known: string[]): ServiceDependency[] {
  const deps: ServiceDependency[] = [];
  const resolve = (host: string) => {
    const matches = known.filter(id => id === host || decodeURIComponent(id.split('/').pop()!) === host);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const addUrls = (text: string, evidence: string) => {
    // Never persist userinfo, URL queries, environment contents or credentials.
    for (const m of text.matchAll(/(https?|postgresql|postgres|redis):\/\/(?:[^\s/'"`]+@)?([\w.-]+)(?::\d+)?(?:\/([\w-]+))?/g)) {
      if (m[1].startsWith('http')) {
        const target = resolve(m[2]);
        if (target) deps.push({targetService: target, type: 'REST', evidence});
      } else deps.push({targetService: m[1] === 'redis' ? m[2] : m[3] || m[2], type: 'DATABASE', evidence});
    }
  };
  for (const file of sourceFiles(root)) {
    const text = fs.readFileSync(file, 'utf8'), evidence = `Source reference in ${path.relative(root, file)}`;
    addUrls(text, evidence);
    for (const m of text.matchAll(/\[\s*["']\/[^"']*["']\s*,\s*["']([^"']+)["']\s*,\s*["']\/[^"']*["']\s*,\s*\[/g)) {
      const target = resolve(m[1]);
      if (target && /fetch\s*\(/.test(text)) deps.push({targetService: target, type: 'REST', evidence: `Proxy route table in ${path.relative(root, file)}`});
    }
    for (const m of text.matchAll(/pgsql:host=[^;'"\s]+;[^'"\n]*dbname=([\w-]+)/g)) deps.push({targetService: m[1], type: 'DATABASE', evidence});
  }
  let dir = root;
  for (let depth = 0; depth < 6; depth++) {
    for (const name of ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml']) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) continue;
      try {
        const doc = parse(fs.readFileSync(file, 'utf8'), {merge: true});
        for (const service of Object.values(doc?.services ?? {}) as any[]) {
          const build = typeof service.build === 'string' ? service.build : service.build?.context;
          if (!build || path.resolve(dir, build) !== path.resolve(root)) continue;
          addUrls(JSON.stringify(service.environment ?? {}), `Environment URLs in ${name} for ${path.relative(dir, root)}`);
        }
      } catch { process.stderr.write(`[BCG] Could not parse Compose file: ${file}\n`); }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return [...new Map(deps.map(d => [`${d.type}:${d.targetService}`, d])).values()];
}

export function configurationRevision(root: string): string {
  const hash = createHash('sha256');
  let dir = root;
  for (let depth = 0; depth < 6; depth++) {
    for (const name of ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) hash.update(file).update(fs.readFileSync(file));
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return hash.digest('hex');
}
