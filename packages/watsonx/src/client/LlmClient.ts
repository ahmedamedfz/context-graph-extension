/**
 * Minimal interface that both WatsonxClient and LocalGraniteClient implement.
 * WatsonxRuntime depends on this interface instead of the concrete class.
 */
export interface LlmClient {
  isConfigured(): boolean;
  generate(prompt: string, maxNewTokens?: number): Promise<string>;
  generateJson<T>(prompt: string, maxNewTokens?: number): Promise<T | null>;
}
