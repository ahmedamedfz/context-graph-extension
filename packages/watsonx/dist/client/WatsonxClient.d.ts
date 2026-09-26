export interface WatsonxConfig {
    apiKey: string;
    projectId: string;
    baseUrl?: string;
    modelId?: string;
}
/**
 * IBM watsonx.ai REST client.
 * Handles authentication and text generation requests.
 */
export declare class WatsonxClient {
    private config;
    private http;
    private accessToken;
    private tokenExpiry;
    private modelId;
    private baseUrl;
    constructor(config: WatsonxConfig);
    /**
     * Get a valid IAM access token.
     */
    private getToken;
    /**
     * Generate text using watsonx.ai.
     */
    generate(prompt: string, maxNewTokens?: number): Promise<string>;
    /**
     * Generate text and attempt to parse JSON from the response.
     */
    generateJson<T>(prompt: string, maxNewTokens?: number): Promise<T | null>;
    isConfigured(): boolean;
}
//# sourceMappingURL=WatsonxClient.d.ts.map