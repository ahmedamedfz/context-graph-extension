import { ServiceContext, ImpactReport, ImpactEntry, ChangeSet } from '@bob-context-graph/core';
import { LlmClient } from './client/LlmClient';

/**
 * High-level reasoning operations for Bob Context Graph.
 * Accepts any LlmClient implementation (watsonx.ai or local Granite).
 */
export class WatsonxRuntime {
  private client: LlmClient;

  constructor(client: LlmClient) {
    this.client = client;
  }

  dispose(): void { this.client.dispose?.(); }

  /**
   * Generate a concise semantic summary for a service.
   */
  async generateServiceSummary(context: ServiceContext): Promise<string> {
    if (!this.client.isConfigured()) {
      return this.fallbackServiceSummary(context);
    }

    const prompt = this.buildServiceSummaryPrompt(context);
    try {
      const result = await this.client.generate(prompt, 200);
      return result || this.fallbackServiceSummary(context);
    } catch {
      return this.fallbackServiceSummary(context);
    }
  }

  /**
   * Reason about the impact of a detected change across the system.
   */
  async analyzeImpact(
    changeSet: ChangeSet,
    changedService: ServiceContext,
    relatedServices: ServiceContext[]
  ): Promise<ImpactReport> {
    const changeDescription = this.describeChanges(changeSet);

    if (!this.client.isConfigured()) {
      return this.fallbackImpactAnalysis(changeSet, changedService, relatedServices, changeDescription);
    }

    const prompt = this.buildImpactPrompt(changeDescription, changedService, relatedServices);

    try {
      const result = await this.client.generateJson<{
        change: string;
        interpretation: string;
        impacts: ImpactEntry[];
        migrationRecommendations: string[];
      }>(prompt, 1500);

      if (result && Array.isArray(result.impacts) && result.impacts.every(i => i && typeof i.component === 'string' && ['SERVICE', 'DATABASE', 'API', 'FRONTEND'].includes(i.componentType) && ['HIGH', 'MEDIUM', 'LOW'].includes(i.severity) && typeof i.reason === 'string') && (!result.migrationRecommendations || (Array.isArray(result.migrationRecommendations) && result.migrationRecommendations.every(s => typeof s === 'string')))) {
        return {
          serviceId: changedService.identity.serviceId,
          change: changeDescription,
          detectedAt: new Date().toISOString(),
          impacts: result.impacts,
          reasoningSource: 'ai',
          migrationRecommendations: result.migrationRecommendations ?? [],
          changeInterpretation: result.interpretation,
        };
      }
    } catch {
      // Fall back to deterministic analysis
    }

    return this.fallbackImpactAnalysis(changeSet, changedService, relatedServices, changeDescription);
  }

  /**
   * Generate API semantic description.
   */
  async describeApi(
    method: string,
    path: string,
    requestModel: string | undefined,
    responseModel: string | undefined,
    serviceContext: ServiceContext
  ): Promise<string> {
    if (!this.client.isConfigured()) {
      return `${method} ${path}${requestModel ? ` accepting ${requestModel}` : ''}${responseModel ? ` returning ${responseModel}` : ''}`;
    }

    const prompt = `Describe this REST API endpoint in one sentence:
Service: ${serviceContext.identity.name}
Method: ${method} ${path}
Request: ${requestModel ?? 'none'}
Response: ${responseModel ?? 'unknown'}

Description:`;

    try {
      return await this.client.generate(prompt, 100);
    } catch {
      return `${method} ${path}`;
    }
  }

  // ── Prompt builders ──────────────────────────────────────────────────────

  private buildServiceSummaryPrompt(context: ServiceContext): string {
    const apis = context.apis.slice(0, 5).map(a => `${a.method} ${a.path}`).join(', ');
    const tables = context.database.map(t => t.tableName).join(', ');
    const deps = context.dependencies.map(d => d.targetService).join(', ');

    return `Summarize this microservice in 2-3 sentences:
Service: ${context.identity.name}
APIs: ${apis || 'none'}
Database tables: ${tables || 'none'}
Dependencies: ${deps || 'none'}

Summary:`;
  }

  private buildImpactPrompt(
    changeDescription: string,
    changedService: ServiceContext,
    relatedServices: ServiceContext[]
  ): string {
    const relatedSummary = relatedServices
      .map(s => {
        const apis = s.apis.slice(0, 3).map(a => `${a.method} ${a.path}`).join(', ');
        const deps = s.dependencies.map(d => d.targetService).join(', ');
        return `- ${s.identity.name}: APIs=[${apis}] depends_on=[${deps}]`;
      })
      .join('\n');

    return `You are a software architect analyzing the impact of a code change.

CHANGE:
${changeDescription}

CHANGED SERVICE: ${changedService.identity.name}
APIs: ${changedService.apis.map(a => `${a.method} ${a.path}`).join(', ')}
Database tables: ${changedService.database.map(t => t.tableName).join(', ')}

RELATED SERVICES:
${relatedSummary}

Analyze the blast radius of this change. For each affected component, provide:
- severity (HIGH/MEDIUM/LOW)
- reason (specific technical explanation)
- recommendedAction

Respond with JSON:
\`\`\`json
{
  "interpretation": "brief change description",
  "impacts": [
    {
      "component": "service-name",
      "componentType": "SERVICE",
      "severity": "HIGH",
      "reason": "why this is affected",
      "recommendedAction": "what to do"
    }
  ],
  "migrationRecommendations": ["step1", "step2"]
}
\`\`\``;
  }

  // ── Fallback (deterministic) implementations ─────────────────────────────

  private fallbackServiceSummary(context: ServiceContext): string {
    const apiCount = context.apis.length;
    const tableCount = context.database.length;
    const depCount = context.dependencies.filter(d => d.type === 'REST').length;
    const dbCount = context.dependencies.filter(d => d.type === 'DATABASE').length;

    const parts = [`${context.identity.name} is a ${context.detectedStack ?? 'unknown-stack'} service (deterministic summary)`];
    if (apiCount > 0) parts.push(`exposing ${apiCount} REST endpoint${apiCount > 1 ? 's' : ''}`);
    if (tableCount > 0) parts.push(`managing ${tableCount} database table${tableCount > 1 ? 's' : ''}`);
    if (depCount > 0) parts.push(`depending on ${depCount} other service${depCount > 1 ? 's' : ''}`);
    if (dbCount > 0) parts.push(`using ${dbCount} database${dbCount > 1 ? 's' : ''}`);

    return parts.join(', ') + '.';
  }

  private fallbackImpactAnalysis(
    changeSet: ChangeSet,
    changedService: ServiceContext,
    relatedServices: ServiceContext[],
    changeDescription: string
  ): ImpactReport {
    const impacts: ImpactEntry[] = [];
    const allServices = [changedService, ...relatedServices];

    // F14: BFS over reverse-dependency graph to find direct and transitive consumers
    const directConsumers = new Set<string>();
    const transitiveConsumers = new Set<string>();

    // Build forward adjacency list: who does each service depend on?
    const dependsOn = new Map<string, Set<string>>();
    for (const svc of allServices) {
      const targets = new Set<string>();
      for (const dep of svc.dependencies) {
        if (dep.type === 'REST') {
          targets.add(dep.targetService);
        }
      }
      dependsOn.set(svc.identity.serviceId, targets);
    }

    // BFS: starting from changedService, find all services reachable in reverse
    const changedId = changedService.identity.serviceId;
    const changedName = changedService.identity.name;

    // Layer 1: direct consumers (services that directly call the changed service)
    for (const svc of relatedServices) {
      const deps = dependsOn.get(svc.identity.serviceId) ?? new Set();
      const dependsDirectly = [...deps].some(
        target =>
          target === changedId ||
          target === changedName
      );
      if (dependsDirectly) {
        directConsumers.add(svc.identity.serviceId);
      }
    }

    // BFS layers: transitive consumers
    const visited = new Set<string>([changedId, ...directConsumers]);
    const queue = [...directConsumers];
    const MAX_DEPTH = 5;
    let depth = 0;
    while (queue.length > 0 && depth < MAX_DEPTH) {
      const layerSize = queue.length;
      for (let i = 0; i < layerSize; i++) {
        const current = queue.shift()!;
        for (const svc of relatedServices) {
          if (visited.has(svc.identity.serviceId)) continue;
          const deps = dependsOn.get(svc.identity.serviceId) ?? new Set();
          const reachable = [...deps].some(
            target =>
              target === current ||
              relatedServices.find(s => s.identity.serviceId === current)?.identity.name
                .replace('-service', '') === target.replace('-service', '')
          );
          if (reachable) {
            transitiveConsumers.add(svc.identity.serviceId);
            visited.add(svc.identity.serviceId);
            queue.push(svc.identity.serviceId);
          }
        }
      }
      depth++;
    }

    // Emit direct consumer impacts
    for (const svcId of directConsumers) {
      const svc = relatedServices.find(s => s.identity.serviceId === svcId)!;
      impacts.push({
        component: svc.identity.name,
        componentType: 'SERVICE',
        nodeId: svc.identity.serviceId,
        severity: changeSet.affectsApi && changeSet.fieldChanges?.some(f => f.category === 'DTO' && f.before !== null && f.before !== f.after) ? 'HIGH' : changeSet.affectsApi ? 'MEDIUM' : 'LOW',
        reason: `${svc.identity.name} directly calls ${changedName} and may be affected by ${
          changeSet.affectsDatabase ? 'database schema changes' : 'API changes'
        }.`,
        recommendedAction: `Review integration contracts with ${changedName}.`,
      });
    }

    // Emit transitive consumer impacts (lower severity — potential, not proven)
    for (const svcId of transitiveConsumers) {
      const svc = relatedServices.find(s => s.identity.serviceId === svcId)!;
      impacts.push({
        component: svc.identity.name,
        componentType: 'SERVICE',
        nodeId: svc.identity.serviceId,
        severity: 'LOW',
        reason: `${svc.identity.name} is a transitive consumer of ${changedName} (indirect dependency). Impact is potential.`,
        recommendedAction: `Monitor for indirect failures; verify integration chain.`,
      });
    }

    // Add API impact if APIs changed
    if (changeSet.affectsApi) {
      impacts.push({
        component: `${changedName} API`,
        nodeId: changedId,
        componentType: 'API',
        severity: 'MEDIUM',
        reason: 'REST API contract may have changed, affecting consumers.',
        recommendedAction: 'Verify API backward compatibility or update version.',
      });
    }

    // Add database impact
    if (changeSet.affectsDatabase) {
      for (const db of changedService.dependencies.filter(d => d.type === 'DATABASE')) impacts.push({
        component: db.targetService,
        nodeId: `db:${db.targetService}`,
        componentType: 'DATABASE',
        severity: 'HIGH',
        reason: 'Database schema changes require migration scripts and may break existing queries.',
        recommendedAction: 'Write and test a database migration script.',
      });
    }

    return {
      serviceId: changedService.identity.serviceId,
      change: changeDescription,
      detectedAt: new Date().toISOString(),
      impacts,
      reasoningSource: 'deterministic',
      traversalTruncated: queue.length > 0,
      migrationRecommendations: this.generateMigrationSteps(changeSet, changedService),
      changeInterpretation: `Detected changes in ${changeSet.changedFiles.length} files affecting ${
        [changeSet.affectsApi && 'API', changeSet.affectsDatabase && 'DB schema', changeSet.affectsDependencies && 'dependencies']
          .filter(Boolean)
          .join(', ')
      }. Direct consumers: ${directConsumers.size}, transitive: ${transitiveConsumers.size}.`,
    };
  }

  private describeChanges(changeSet: ChangeSet): string {
    const types: string[] = [];
    if (changeSet.affectsApi) types.push('API changes');
    if (changeSet.affectsDatabase) types.push('database schema changes');
    if (changeSet.affectsDependencies) types.push('dependency changes');
    const desc = types.length > 0 ? types.join(', ') : 'code changes';
    return `${changeSet.serviceId}: ${desc} (${changeSet.changedFiles.length} files, ${changeSet.oldCommit.slice(0, 7)} → ${changeSet.newCommit.slice(0, 7)})` + (changeSet.fieldChanges?.map(f => `\n${f.file}: ${f.field}: ${f.before ?? '(absent)'} → ${f.after ?? '(removed)'}`).join('') ?? '');
  }

  private generateMigrationSteps(changeSet: ChangeSet, svc: ServiceContext): string[] {
    const steps: string[] = [];

    if (changeSet.affectsDatabase) {
      steps.push(`1. Write a database migration script (Flyway/Liquibase) for ${svc.identity.name}`);
      steps.push('2. Test the migration on a staging environment');
      steps.push('3. Coordinate deployment with all dependent services');
    }

    if (changeSet.affectsApi) {
      steps.push('4. Update API documentation (OpenAPI/Swagger)');
      steps.push('5. Notify downstream service teams of contract changes');
      steps.push('6. Consider API versioning if backward compatibility cannot be maintained');
    }

    if (steps.length === 0) {
      steps.push('1. Review changed files for unintended side effects');
      steps.push('2. Run the full test suite');
      steps.push('3. Deploy with monitoring enabled');
    }

    return steps;
  }
}
