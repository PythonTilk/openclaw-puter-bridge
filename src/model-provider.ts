import { Config } from './config';
import { PuterAPIClient, createPuterAPIClient } from './puter-api';
import {
  OpenAICompatibleRequest,
  OpenAICompatibleResponse,
  OpenAICompatibleStreamChunk,
  SUPPORTED_MODELS,
  ModelInfo,
} from './types';

export interface ModelProvider {
  generate(request: OpenAICompatibleRequest): Promise<OpenAICompatibleResponse>;
  generateStream(request: OpenAICompatibleRequest): AsyncGenerator<OpenAICompatibleStreamChunk, void, unknown>;
  getModels(): ModelInfo[];
  getDefaultModel(): string;
}

export class PuterModelProvider implements ModelProvider {
  private apiClient: PuterAPIClient;
  private config: Config;
  private defaultModel: string;

  constructor(config: Config) {
    this.config = config;
    this.apiClient = createPuterAPIClient(config);
    this.defaultModel = config.getDefaultModel() || 'puter/gpt-5-nano';
  }

  async generate(request: OpenAICompatibleRequest): Promise<OpenAICompatibleResponse> {
    const model = request.model || this.defaultModel;
    const messages = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    return this.apiClient.completeChat(
      model,
      messages,
      {
        temperature: request.temperature,
        top_p: request.top_p,
        max_tokens: request.max_tokens,
      }
    );
  }

  async *generateStream(request: OpenAICompatibleRequest): AsyncGenerator<OpenAICompatibleStreamChunk, void, unknown> {
    const model = request.model || this.defaultModel;
    const messages = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const stream = this.apiClient.streamChat(
      model,
      messages,
      {
        temperature: request.temperature,
        top_p: request.top_p,
        max_tokens: request.max_tokens,
      }
    );

    for await (const chunk of stream) {
      yield chunk;
    }
  }

  getModels(): ModelInfo[] {
    return SUPPORTED_MODELS;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    return this.config.validate();
  }
}

export function createModelProvider(config: Config): ModelProvider {
  return new PuterModelProvider(config);
}
