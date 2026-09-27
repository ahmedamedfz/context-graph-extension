export interface ServiceIdentity {
    serviceId: string;
    repository: string;
    branch: string;
    commitHash: string;
    previousCommitHash?: string;
    rootPath: string;
    name: string;
}
export interface ModelSchema {
    name: string;
    fields: Array<{
        name: string;
        type: string;
    }>;
    evidence: string;
    completeness: 'partial';
}
export interface ApiEndpoint {
    requestSchema?: ModelSchema | null;
    responseSchema?: ModelSchema | null;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'ANY';
    path: string;
    controller: string;
    handlerMethod: string;
    requestModel?: string;
    responseModel?: string;
    semanticDescription?: string;
    provenance?: {
        file: string;
        line: number;
        parser: string;
        confidence: 'observed' | 'partial';
    };
}
export interface DatabaseColumn {
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isNullable: boolean;
    javaType: string;
}
export interface DatabaseRelationship {
    type: 'ManyToOne' | 'OneToMany' | 'ManyToMany' | 'OneToOne';
    fromEntity: string;
    toEntity: string;
    fieldName: string;
}
export interface DatabaseTable {
    tableName: string;
    entityClass: string;
    columns: DatabaseColumn[];
    relationships: DatabaseRelationship[];
}
export interface ServiceDependency {
    targetService: string;
    type: 'REST' | 'DATABASE' | 'EVENT';
    endpoints?: string[];
    evidence: string;
}
export interface ServiceContext {
    models?: ModelSchema[];
    coverage?: {
        routes: 'static-patterns';
        schemas: 'partial' | 'unsupported';
        events: 'unsupported';
    };
    configurationRevision?: string;
    identity: ServiceIdentity;
    apis: ApiEndpoint[];
    database: DatabaseTable[];
    dependencies: ServiceDependency[];
    events: {
        publishes: string[];
        consumes: string[];
    };
    semanticSummary?: string;
    analyzedAt: string;
    fileCount: number;
    status: 'Indexed' | 'Cached' | 'Changed' | 'Analyzing' | 'Error';
    error?: string;
    /** Stack that was detected for this service (spring-boot, node, python, go, unknown) */
    detectedStack?: DetectedStack;
}
export type NodeType = 'SERVICE' | 'DATABASE';
export interface GraphNode {
    id: string;
    type: NodeType;
    label: string;
    data: ServiceContext | DatabaseNodeData;
    impactSeverity?: 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE';
    impactReason?: string;
}
export interface DatabaseNodeData {
    name: string;
    tables: DatabaseTable[];
    ownerServiceId: string;
    /** F17: all service IDs that share this database */
    ownerServiceIds?: string[];
}
export type EdgeType = 'SERVICE_DEPENDS_ON_SERVICE' | 'SERVICE_USES_DATABASE';
export interface GraphEdge {
    id: string;
    type: EdgeType;
    source: string;
    target: string;
    label?: string;
}
export interface SystemContextGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    generatedAt: string;
    systemSummary?: string;
}
export type FileCategory = 'API' | 'ENTITY' | 'DTO' | 'SERVICE' | 'CONFIG' | 'UNKNOWN';
export interface ChangedFile {
    path: string;
    category: FileCategory;
    changeType: 'added' | 'modified' | 'deleted';
}
export interface ChangeSet {
    serviceId: string;
    oldCommit: string;
    newCommit: string;
    changedFiles: ChangedFile[];
    fieldChanges?: Array<{
        file: string;
        field: string;
        before: string | null;
        after: string | null;
        category: FileCategory;
    }>;
    affectsApi: boolean;
    affectsDatabase: boolean;
    affectsDependencies: boolean;
}
export type ImpactSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export interface ImpactEntry {
    nodeId?: string;
    component: string;
    componentType: 'SERVICE' | 'DATABASE' | 'API' | 'FRONTEND';
    severity: ImpactSeverity;
    reason: string;
    affectedFiles?: string[];
    recommendedAction?: string;
}
export interface ImpactReport {
    serviceId: string;
    change: string;
    oldValue?: string;
    newValue?: string;
    detectedAt: string;
    impacts: ImpactEntry[];
    migrationRecommendations: string[];
    changeInterpretation?: string;
    reasoningSource?: 'ai' | 'deterministic';
    traversalTruncated?: boolean;
}
export type DetectedStack = 'spring-boot' | 'node' | 'python' | 'go' | 'java' | 'php' | 'unknown';
export interface DiscoveredService {
    serviceId: string;
    name: string;
    rootPath: string;
    repository: string;
    branch: string;
    commitHash: string;
    isGitRepo: boolean;
    detectedStack: DetectedStack;
}
//# sourceMappingURL=types.d.ts.map