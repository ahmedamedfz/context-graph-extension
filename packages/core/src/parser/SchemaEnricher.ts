import * as fs from 'fs';
import * as path from 'path';
import { ServiceContext, ModelSchema } from '../models/types';
import { sourceFiles } from './NativeApiParser';

/** Explicit declarations only. Null schema means unresolved, never a confirmed empty model. */
export function enrichSchemas(context: ServiceContext): void {
  const models: ModelSchema[] = [];
  for (const file of sourceFiles(context.identity.rootPath).filter(f => f.endsWith('.java'))) {
    const text = fs.readFileSync(file, 'utf8');
    const name = text.match(/\b(?:class|record)\s+(\w+)/)?.[1];
    if (!name) continue;
    const fields = [...text.matchAll(/(?:private|protected|public)\s+(?!static\b)([\w<>?,.]+)\s+(\w+)\s*[;=]/g)].map(m => ({name: m[2], type: m[1]}));
    if (fields.length) models.push({name, fields, evidence: path.relative(context.identity.rootPath, file), completeness: 'partial'});
  }
  context.models = models;
  const resolve = (ref?: string) => {
    if (!ref) return null;
    const matches = models.filter(m => ref.split(/\W+/).includes(m.name));
    return matches.length === 1 ? matches[0] : null;
  };
  for (const api of context.apis) {
    api.requestSchema = resolve(api.requestModel);
    api.responseSchema = resolve(api.responseModel);
  }
  context.coverage = {routes: 'static-patterns', schemas: context.detectedStack === 'spring-boot' || context.detectedStack === 'java' ? 'partial' : 'unsupported', events: 'unsupported'};
}
