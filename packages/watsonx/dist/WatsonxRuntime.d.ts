import { ServiceContext, ImpactReport, ChangeSet } from '@bob-context-graph/core';
import { WatsonxClient } from './client/WatsonxClient';
/**
 * High-level watsonx-powered reasoning operations for Bob Context Graph.
 */
export declare class WatsonxRuntime {
    private client;
    constructor(client: WatsonxClient);
    /**
     * Generate a concise semantic summary for a service.
     */
    generateServiceSummary(context: ServiceContext): Promise<string>;
    /**
     * Reason about the impact of a detected change across the system.
     */
    analyzeImpact(changeSet: ChangeSet, changedService: ServiceContext, relatedServices: ServiceContext[]): Promise<ImpactReport>;
    /**
     * Generate API semantic description.
     */
    describeApi(method: string, path: string, requestModel: string | undefined, responseModel: string | undefined, serviceContext: ServiceContext): Promise<string>;
    private buildServiceSummaryPrompt;
    private buildImpactPrompt;
    private fallbackServiceSummary;
    private fallbackImpactAnalysis;
    private describeChanges;
    private generateMigrationSteps;
}
//# sourceMappingURL=WatsonxRuntime.d.ts.map