"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WatsonxClient = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * IBM watsonx.ai REST client.
 * Handles authentication and text generation requests.
 */
class WatsonxClient {
    constructor(config) {
        this.accessToken = null;
        this.tokenExpiry = 0;
        this.config = config;
        this.modelId = config.modelId ?? 'ibm/granite-13b-instruct-v2';
        this.baseUrl = config.baseUrl ?? 'https://us-south.ml.cloud.ibm.com';
        this.http = axios_1.default.create({ timeout: 60000 });
    }
    /**
     * Get a valid IAM access token.
     */
    async getToken() {
        const now = Date.now() / 1000;
        if (this.accessToken && this.tokenExpiry > now + 60) {
            return this.accessToken;
        }
        const response = await axios_1.default.post('https://iam.cloud.ibm.com/identity/token', new URLSearchParams({
            grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
            apikey: this.config.apiKey,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        this.accessToken = response.data.access_token;
        this.tokenExpiry = response.data.expiration;
        return this.accessToken;
    }
    /**
     * Generate text using watsonx.ai.
     */
    async generate(prompt, maxNewTokens = 500) {
        const token = await this.getToken();
        const response = await this.http.post(`${this.baseUrl}/ml/v1/text/generation?version=2023-05-29`, {
            model_id: this.modelId,
            input: prompt,
            parameters: {
                decoding_method: 'greedy',
                max_new_tokens: maxNewTokens,
                repetition_penalty: 1.05,
                stop_sequences: ['```', '---'],
            },
            project_id: this.config.projectId,
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        const results = response.data?.results;
        if (!results || results.length === 0)
            return '';
        return results[0].generated_text?.trim() ?? '';
    }
    /**
     * Generate text and attempt to parse JSON from the response.
     */
    async generateJson(prompt, maxNewTokens = 1000) {
        const raw = await this.generate(prompt, maxNewTokens);
        // Try to extract JSON from the response
        const jsonMatch = raw.match(/```json\s*([\s\S]+?)\s*```/) ||
            raw.match(/```\s*([\s\S]+?)\s*```/) ||
            raw.match(/(\{[\s\S]+\})/);
        if (!jsonMatch) {
            // Try raw parse
            try {
                return JSON.parse(raw);
            }
            catch {
                return null;
            }
        }
        try {
            return JSON.parse(jsonMatch[1]);
        }
        catch {
            return null;
        }
    }
    isConfigured() {
        return !!(this.config.apiKey && this.config.projectId);
    }
}
exports.WatsonxClient = WatsonxClient;
//# sourceMappingURL=WatsonxClient.js.map