"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WatsonxRuntime = void 0;
/**
 * High-level watsonx-powered reasoning operations for Bob Context Graph.
 */
class WatsonxRuntime {
    constructor(client) {
        this.client = client;
    }
    /**
     * Generate a concise semantic summary for a service.
     */
    async generateServiceSummary(context) {
        if (!this.client.isConfigured()) {
            return this.fallbackServiceSummary(context);
        }
        const prompt = this.buildServiceSummaryPrompt(context);
        try {
            const result = await this.client.generate(prompt, 200);
            return result || this.fallbackServiceSummary(context);
        }
        catch {
            return this.fallbackServiceSummary(context);
        }
    }
    /**
     * Reason about the impact of a detected change across the system.
     */
    async analyzeImpact(changeSet, changedService, relatedServices) {
        const changeDescription = this.describeChanges(changeSet);
        if (!this.client.isConfigured()) {
            return this.fallbackImpactAnalysis(changeSet, changedService, relatedServices, changeDescription);
        }
        const prompt = this.buildImpactPrompt(changeDescription, changedService, relatedServices);
        try {
            const result = await this.client.generateJson(prompt, 1500);
            if (result && result.impacts) {
                return {
                    serviceId: changedService.identity.serviceId,
                    change: changeDescription,
                    detectedAt: new Date().toISOString(),
                    impacts: result.impacts,
                    migrationRecommendations: result.migrationRecommendations ?? [],
                    changeInterpretation: result.interpretation,
                };
            }
        }
        catch {
            // Fall back to deterministic analysis
        }
        return this.fallbackImpactAnalysis(changeSet, changedService, relatedServices, changeDescription);
    }
    /**
     * Generate API semantic description.
     */
    async describeApi(method, path, requestModel, responseModel, serviceContext) {
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
        }
        catch {
            return `${method} ${path}`;
        }
    }
    // ── Prompt builders ──────────────────────────────────────────────────────
    buildServiceSummaryPrompt(context) {
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
    buildImpactPrompt(changeDescription, changedService, relatedServices) {
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
    fallbackServiceSummary(context) {
        const apiCount = context.apis.length;
        const tableCount = context.database.length;
        const depCount = context.dependencies.filter(d => d.type === 'REST').length;
        const dbCount = context.dependencies.filter(d => d.type === 'DATABASE').length;
        const parts = [`${context.identity.name} is a Spring Boot microservice`];
        if (apiCount > 0)
            parts.push(`exposing ${apiCount} REST endpoint${apiCount > 1 ? 's' : ''}`);
        if (tableCount > 0)
            parts.push(`managing ${tableCount} database table${tableCount > 1 ? 's' : ''}`);
        if (depCount > 0)
            parts.push(`depending on ${depCount} other service${depCount > 1 ? 's' : ''}`);
        if (dbCount > 0)
            parts.push(`using ${dbCount} database${dbCount > 1 ? 's' : ''}`);
        return parts.join(', ') + '.';
    }
    fallbackImpactAnalysis(changeSet, changedService, relatedServices, changeDescription) {
        const impacts = [];
        // Find services that depend on the changed service
        for (const svc of relatedServices) {
            const dependsOnChanged = svc.dependencies.some(d => d.targetService === changedService.identity.serviceId ||
                d.targetService.includes(changedService.identity.name.replace('-service', '')));
            if (dependsOnChanged) {
                impacts.push({
                    component: svc.identity.name,
                    componentType: 'SERVICE',
                    severity: changeSet.affectsDatabase ? 'HIGH' : 'MEDIUM',
                    reason: `${svc.identity.name} depends on ${changedService.identity.name} and may be affected by ${changeSet.affectsDatabase ? 'database schema changes' : 'API changes'}.`,
                    recommendedAction: `Review integration contracts with ${changedService.identity.name}.`,
                });
            }
        }
        // Add API impact if APIs changed
        if (changeSet.affectsApi) {
            impacts.push({
                component: `${changedService.identity.name} API`,
                componentType: 'API',
                severity: 'MEDIUM',
                reason: 'REST API contract may have changed, affecting consumers.',
                recommendedAction: 'Verify API backward compatibility or update version.',
            });
        }
        // Add database impact
        if (changeSet.affectsDatabase) {
            impacts.push({
                component: `${changedService.identity.name} Database`,
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
            migrationRecommendations: this.generateMigrationSteps(changeSet, changedService),
            changeInterpretation: `Detected changes in ${changeSet.changedFiles.length} files affecting ${[changeSet.affectsApi && 'API', changeSet.affectsDatabase && 'DB schema', changeSet.affectsDependencies && 'dependencies']
                .filter(Boolean)
                .join(', ')}.`,
        };
    }
    describeChanges(changeSet) {
        const types = [];
        if (changeSet.affectsApi)
            types.push('API changes');
        if (changeSet.affectsDatabase)
            types.push('database schema changes');
        if (changeSet.affectsDependencies)
            types.push('dependency changes');
        const desc = types.length > 0 ? types.join(', ') : 'code changes';
        return `${changeSet.serviceId}: ${desc} (${changeSet.changedFiles.length} files, ${changeSet.oldCommit.slice(0, 7)} → ${changeSet.newCommit.slice(0, 7)})`;
    }
    generateMigrationSteps(changeSet, svc) {
        const steps = [];
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
exports.WatsonxRuntime = WatsonxRuntime;
//# sourceMappingURL=WatsonxRuntime.js.map