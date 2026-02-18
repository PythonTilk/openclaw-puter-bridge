import { Config } from './config';
import {
  PuterDriverRequest,
  PuterDriverResponse,
  OpenAICompatibleResponse,
  OpenAICompatibleStreamChunk,
  SUPPORTED_MODELS,
} from './types';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Shape of errors we throw/receive (status may not exist on network errors)
interface HttpError extends Error {
  status?: number;
  body?: string;
}

export class PuterAPIClient {
  private config: Config;
  private baseUrl: string;

  constructor(config: Config) {
    this.config = config;
    this.baseUrl = config.getApiUrl();
  }

  // -------------------------------------------------------------------------
  // Retry orchestration
  // -------------------------------------------------------------------------

  private async callDriverWithRetry(
    request: PuterDriverRequest,
    retries: number = MAX_RETRIES,
  ): Promise<PuterDriverResponse> {
    // CRIT-01: initialise with a real Error so the final `throw` is never `throw null`
    let lastError: Error = new Error('Request failed: no attempts were made');
    let backoffMs = INITIAL_BACKOFF_MS;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this.callDriver(request);
      } catch (err: unknown) {
        const error = err as HttpError;
        lastError = err instanceof Error ? err : new Error(String(err));

        const isLastAttempt = attempt === retries - 1;

        // CRIT-02: guard the 429 branch so we don't continue past the last attempt
        if (error.status === 429) {
          if (isLastAttempt) throw lastError;
          console.warn(`[PuterBridge] Rate limited (429). Retrying in ${backoffMs}ms…`);
          await this.sleep(backoffMs);
          backoffMs *= 2;
          continue;
        }

        if (!isLastAttempt && this.isRetryableError(error)) {
          console.warn(
            `[PuterBridge] Request failed (attempt ${attempt + 1}/${retries}). Retrying in ${backoffMs}ms…`,
          );
          await this.sleep(backoffMs);
          backoffMs *= 2;
          continue;
        }

        throw lastError;
      }
    }

    throw lastError;
  }

  private isRetryableError(error: HttpError): boolean {
    // MIN-05: network-level errors (no status) are always transient — retry them
    if (error.status == null) return true;
    return [408, 429, 500, 502, 503, 504].includes(error.status);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // Core HTTP call
  // -------------------------------------------------------------------------

  private async callDriver(request: PuterDriverRequest): Promise<PuterDriverResponse> {
    const token = this.config.getAuthToken();
    if (!token) throw new Error('No authentication token available');

    const response = await fetch(`${this.baseUrl}/drivers/call`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text();
      const error = Object.assign(
        new Error(`Puter API error: ${response.status} ${response.statusText}`),
        { status: response.status, body },
      ) as HttpError;
      throw error;
    }

    return response.json() as Promise<PuterDriverResponse>;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * List available models. Falls back to the statically-known list on failure
   * so the plugin stays functional without a live round-trip.
   */
  async listModels(): Promise<string[]> {
    try {
      // MAJ-06: use the correct interface name for chat-completion service
      const request: PuterDriverRequest = {
        interface: 'puter-chat-completion',
        service: 'openai',
        method: 'models',
        args: {},
      };
      const response = await this.callDriverWithRetry(request);
      if (response.success && Array.isArray(response.result)) {
        return response.result as string[];
      }
    } catch (err: unknown) {
      console.warn('[PuterBridge] listModels() failed, returning static list:', (err as Error).message);
    }
    return SUPPORTED_MODELS.map(m => m.id);
  }

  /** Non-streaming chat completion. */
  async completeChat(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: { temperature?: number; top_p?: number; max_tokens?: number } = {},
  ): Promise<OpenAICompatibleResponse> {
    const puterModel = this.mapModelToPuter(model);

    // MAJ-07: only forward explicitly-provided options — let Puter apply its own defaults
    const args: Record<string, unknown> = {
      model: puterModel,
      messages,
      stream: false,
    };
    if (options.temperature !== undefined) args['temperature'] = options.temperature;
    if (options.top_p !== undefined) args['top_p'] = options.top_p;
    if (options.max_tokens !== undefined) args['max_tokens'] = options.max_tokens;

    const response = await this.callDriverWithRetry({
      interface: 'puter-chat-completion',
      service: 'openai',
      method: 'complete',
      args,
    });

    // CRIT-03: guard null/undefined result before passing to translator
    if (!response.success || response.result == null) {
      throw new Error(response.error ?? 'Puter API request failed with no result');
    }

    // MIN-04: pass the original (prefixed) model name so responses echo it back
    return this.translateResponse(response.result, model);
  }

  /** Streaming chat completion — yields SSE chunks. */
  async *streamChat(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: { temperature?: number; top_p?: number; max_tokens?: number } = {},
  ): AsyncGenerator<OpenAICompatibleStreamChunk, void, unknown> {
    const puterModel = this.mapModelToPuter(model);
    const token = this.config.getAuthToken();
    if (!token) throw new Error('No authentication token available');

    // MAJ-07: same selective-forwarding for stream path
    const args: Record<string, unknown> = {
      model: puterModel,
      messages,
      stream: true,
    };
    if (options.temperature !== undefined) args['temperature'] = options.temperature;
    if (options.top_p !== undefined) args['top_p'] = options.top_p;
    if (options.max_tokens !== undefined) args['max_tokens'] = options.max_tokens;

    const response = await fetch(`${this.baseUrl}/drivers/call`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        interface: 'puter-chat-completion',
        service: 'openai',
        method: 'complete',
        args,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Puter API error: ${response.status} ${response.statusText} — ${body}`);
    }
    if (!response.body) throw new Error('Streaming response body is null');

    // CRIT-04: Node 18 ReadableStream is both a Web ReadableStream and an AsyncIterable.
    // Prefer the async-iterable path; fall back to getReader() for environments that
    // only expose the Web Streams API.
    const body = response.body as ReadableStream<Uint8Array> & AsyncIterable<Uint8Array>;
    const decoder = new TextDecoder();
    let buffer = '';

    const parseLine = (line: string): OpenAICompatibleStreamChunk | null => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) return null;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return null;
      try {
        return this.translateStreamChunk(JSON.parse(data), model);
      } catch {
        return null;
      }
    };

    const flushBuffer = (final: boolean): OpenAICompatibleStreamChunk[] => {
      const lines = buffer.split('\n');
      buffer = final ? '' : (lines.pop() ?? '');
      return lines.flatMap(l => { const c = parseLine(l); return c ? [c] : []; });
    };

    if (Symbol.asyncIterator in body) {
      for await (const chunk of body) {
        buffer += decoder.decode(chunk, { stream: true });
        for (const c of flushBuffer(false)) yield c;
      }
    } else {
      const reader = (body as ReadableStream<Uint8Array>).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (const c of flushBuffer(false)) yield c;
      }
    }

    // MIN-06: flush TextDecoder state + any remaining buffer after stream ends
    buffer += decoder.decode();
    for (const c of flushBuffer(true)) yield c;
  }

  // -------------------------------------------------------------------------
  // Translation helpers
  // -------------------------------------------------------------------------

  private mapModelToPuter(model: string): string {
    return model.startsWith('puter/') ? model.slice(6) : model;
  }

  private translateResponse(result: unknown, originalModel: string): OpenAICompatibleResponse {
    const r = result as Record<string, unknown>;
    const choices = Array.isArray(r['choices'])
      ? (r['choices'] as OpenAICompatibleResponse['choices'])
      : [{
          index: 0,
          message: {
            role: 'assistant',
            content:
              typeof r['content'] === 'string'
                ? r['content']
                : typeof (r['message'] as Record<string, unknown> | undefined)?.['content'] === 'string'
                  ? String((r['message'] as Record<string, unknown>)['content'])
                  : '',
          },
          finish_reason: typeof r['finish_reason'] === 'string' ? r['finish_reason'] : 'stop',
        }];

    return {
      id: typeof r['id'] === 'string' ? r['id'] : `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: typeof r['created'] === 'number' ? r['created'] : Math.floor(Date.now() / 1000),
      // MIN-04: echo back the caller's original (puter/-prefixed) model name
      model: originalModel,
      choices,
      usage: (r['usage'] as OpenAICompatibleResponse['usage']) ?? {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  private translateStreamChunk(chunk: unknown, originalModel: string): OpenAICompatibleStreamChunk {
    const c = chunk as Record<string, unknown>;
    return {
      id: typeof c['id'] === 'string' ? c['id'] : `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: typeof c['created'] === 'number' ? c['created'] : Math.floor(Date.now() / 1000),
      // MIN-04: echo back caller's model name
      model: originalModel,
      choices: Array.isArray(c['choices'])
        ? (c['choices'] as OpenAICompatibleStreamChunk['choices'])
        : [],
      usage: c['usage'] as OpenAICompatibleStreamChunk['usage'],
    };
  }
}

export function createPuterAPIClient(config: Config): PuterAPIClient {
  return new PuterAPIClient(config);
}
