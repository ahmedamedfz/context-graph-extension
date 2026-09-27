import axios, { AxiosInstance } from 'axios';
import { LlmClient } from './LlmClient';

/**
 * Local IBM Granite inference client using Ollama.
 *
 * Calls the Ollama OpenAI-compatible API at http://localhost:11434/api/generate.
 * Model: "granite4.2-3b" (pulled via `ollama pull granite4.2-3b`).
 */
export class LocalGraniteClient implements LlmClient {
  /** Ollama model tag to use. */
  static readonly MODEL_ID = 'granite4.2-3b';
  /** Ollama generate endpoint. */
  static readonly OLLAMA_URL = 'http://localhost:11434/api/generate';

  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({ timeout: 120_000 });
  }

  /** Returns true when Ollama is reachable and the model is available. */
  async isAvailable(): Promise<boolean> {
    try {
      const resp = await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
      const models: Array<{ name: string }> = resp.data?.models ?? [];
      return models.some(m => m.name.startsWith(LocalGraniteClient.MODEL_ID));
    } catch {
      return false;
    }
  }

  /** Always returns true — callers use `isAvailable()` to probe at startup. */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Generate text using the local Granite model via Ollama.
   */
  async generate(prompt: string, maxNewTokens = 500): Promise<string> {
    const response = await this.http.post(LocalGraniteClient.OLLAMA_URL, {
      model: LocalGraniteClient.MODEL_ID,
      prompt,
      stream: false,
      options: {
        num_predict: maxNewTokens,
        temperature: 0.1,
        stop: ['```', '---'],
      },
    });

    return (response.data?.response as string | undefined)?.trim() ?? '';
  }

  /**
   * Generate text and attempt to parse JSON from the response.
   */
  async generateJson<T>(prompt: string, maxNewTokens = 1000): Promise<T | null> {
    const raw = await this.generate(prompt, maxNewTokens);

    const jsonMatch =
      raw.match(/```json\s*([\s\S]+?)\s*```/) ||
      raw.match(/```\s*([\s\S]+?)\s*```/) ||
      raw.match(/(\{[\s\S]+\})/);

    if (!jsonMatch) {
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
}
