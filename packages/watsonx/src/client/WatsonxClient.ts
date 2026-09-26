import axios, { AxiosInstance } from 'axios';

export interface WatsonxConfig {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  modelId?: string;
}

interface TokenResponse {
  access_token: string;
  expiration: number;
}

/**
 * IBM watsonx.ai REST client.
 * Handles authentication and text generation requests.
 */
export class WatsonxClient {
  private config: WatsonxConfig;
  private http: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry = 0;
  private modelId: string;
  private baseUrl: string;

  constructor(config: WatsonxConfig) {
    this.config = config;
    this.modelId = config.modelId ?? 'ibm/granite-13b-instruct-v2';
    this.baseUrl = config.baseUrl ?? 'https://us-south.ml.cloud.ibm.com';
    this.http = axios.create({ timeout: 60000 });
  }

  /**
   * Get a valid IAM access token.
   */
  private async getToken(): Promise<string> {
    const now = Date.now() / 1000;
    if (this.accessToken && this.tokenExpiry > now + 60) {
      return this.accessToken;
    }

    const response = await axios.post<TokenResponse>(
      'https://iam.cloud.ibm.com/identity/token',
      new URLSearchParams({
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: this.config.apiKey,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = response.data.expiration;
    return this.accessToken;
  }

  /**
   * Generate text using watsonx.ai.
   */
  async generate(prompt: string, maxNewTokens = 500): Promise<string> {
    const token = await this.getToken();

    const response = await this.http.post(
      `${this.baseUrl}/ml/v1/text/generation?version=2023-05-29`,
      {
        model_id: this.modelId,
        input: prompt,
        parameters: {
          decoding_method: 'greedy',
          max_new_tokens: maxNewTokens,
          repetition_penalty: 1.05,
          stop_sequences: ['```', '---'],
        },
        project_id: this.config.projectId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const results = response.data?.results;
    if (!results || results.length === 0) return '';
    return results[0].generated_text?.trim() ?? '';
  }

  /**
   * Generate text and attempt to parse JSON from the response.
   */
  async generateJson<T>(prompt: string, maxNewTokens = 1000): Promise<T | null> {
    const raw = await this.generate(prompt, maxNewTokens);

    // Try to extract JSON from the response
    const jsonMatch = raw.match(/```json\s*([\s\S]+?)\s*```/) ||
                      raw.match(/```\s*([\s\S]+?)\s*```/) ||
                      raw.match(/(\{[\s\S]+\})/);

    if (!jsonMatch) {
      // Try raw parse
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    }

    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {
      return null;
    }
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.projectId);
  }
}
