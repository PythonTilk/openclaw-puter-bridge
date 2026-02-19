import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from './config';
import { createModelProvider, ModelProvider } from './model-provider';
import { SUPPORTED_MODELS, PuterBridgeConfig, PUTER_PROXY_BASE_URL, PUTER_DRIVER_URL } from './types';

// MIN-08: load manifest from openclaw.plugin.json — single source of truth.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pluginManifestJson = require('../openclaw.plugin.json') as {
  id: string;
  name: string;
  description: string;
  version: string;
  main: string;
  configSchema: { type: string; properties: Record<string, unknown> };
};

export type PluginManifest = typeof pluginManifestJson;

// ---------------------------------------------------------------------------
// OpenClaw plugin API types (minimal surface we use)
// ---------------------------------------------------------------------------

interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface PrompterContext {
  text: (opts: { message: string; validate?: (v: string) => string | undefined }) => Promise<string>;
}

interface ProviderAuthContext {
  prompter: PrompterContext;
}

interface ProviderModelDef {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: Array<'text' | 'image'>;
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow?: number;
  maxTokens?: number;
}

interface RegisterProviderArgs {
  id: string;
  label: string;
  docsPath?: string;
  aliases?: string[];
  envVars?: string[];
  models?: {
    baseUrl: string;
    api: 'openai-completions' | 'anthropic-messages';
    models: ProviderModelDef[];
  };
  auth: Array<{
    id: string;
    label: string;
    hint?: string;
    kind: 'api_key' | 'oauth' | 'device_code';
    run: (ctx: ProviderAuthContext) => Promise<{
      profiles: Array<{
        profileId: string;
        credential: { type: 'api_key'; provider: string; key: string };
      }>;
      configPatch?: {
        models?: {
          providers?: Record<string, {
            baseUrl: string;
            api: 'openai-completions' | 'anthropic-messages';
            models: ProviderModelDef[];
          }>;
        };
        agents?: { defaults?: { models?: Record<string, { alias: string }> } };
      };
      defaultModel?: string;
      notes?: string[];
    }>;
  }>;
}

interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer | string;
}

interface HttpResponse {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
}

interface OpenClawPluginApi {
  pluginConfig?: unknown;
  logger: PluginLogger;
  registerProvider: (args: RegisterProviderArgs) => void;
  registerHttpHandler?: (handler: (req: HttpRequest) => Promise<HttpResponse | null>) => void;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let modelProvider: ModelProvider | null = null;
export const manifest: PluginManifest = pluginManifestJson;

// ---------------------------------------------------------------------------
// Model catalog for registerProvider
// SUPPORTED_MODELS[].id = "puter/<puter-model-id>"
// registerProvider needs id = "<puter-model-id>" (strip leading "puter/")
// ---------------------------------------------------------------------------

const PROVIDER_MODELS: ProviderModelDef[] = SUPPORTED_MODELS.map(m => ({
  id: m.id.slice('puter/'.length),   // "puter/openai/gpt-5-nano" → "openai/gpt-5-nano"
  name: m.name,
  reasoning: m.reasoning,
  input: m.input ?? ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: m.context_window ?? 128000,
  maxTokens: m.maxTokens ?? 8192,
}));

// Alias map for configPatch agents.defaults.models
const MODEL_ALIASES: Record<string, { alias: string }> = {};
for (const m of SUPPORTED_MODELS) {
  MODEL_ALIASES[m.id] = { alias: `${m.name} (Puter)` };
}

// ---------------------------------------------------------------------------
// HTTP proxy handler
//
// OpenClaw sends standard OpenAI-format POSTs to PUTER_PROXY_BASE_URL.
// We intercept them here and translate to Puter's /drivers/call format,
// injecting the stored Bearer token.
// ---------------------------------------------------------------------------

async function handleProxyRequest(
  req: HttpRequest,
  getToken: () => string | null,
  logger: PluginLogger,
): Promise<HttpResponse | null> {
  if (!req.url.startsWith(PUTER_PROXY_BASE_URL)) return null;

  const token = getToken();
  if (!token) {
    logger.error('[PuterBridge] Proxy: no auth token available');
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'No Puter auth token configured', type: 'auth_error' } }),
    };
  }

  let openAIBody: Record<string, unknown>;
  try {
    const raw = typeof req.body === 'string' ? req.body : req.body?.toString('utf-8') ?? '{}';
    openAIBody = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Invalid JSON body', type: 'invalid_request_error' } }),
    };
  }

  // Model field from OpenClaw: "puter/openai/gpt-5-nano" → strip "puter/" → "openai/gpt-5-nano"
  const rawModel = String(openAIBody['model'] ?? '');
  const puterModel = rawModel.startsWith('puter/') ? rawModel.slice('puter/'.length) : rawModel;
  const isStream = Boolean(openAIBody['stream']);

  const driverArgs: Record<string, unknown> = {
    model: puterModel,
    messages: openAIBody['messages'],
    stream: isStream,
  };
  if (openAIBody['temperature'] !== undefined) driverArgs['temperature'] = openAIBody['temperature'];
  if (openAIBody['top_p'] !== undefined) driverArgs['top_p'] = openAIBody['top_p'];
  if (openAIBody['max_tokens'] !== undefined) driverArgs['max_tokens'] = openAIBody['max_tokens'];

  let puterResponse: Response;
  try {
    puterResponse = await fetch(PUTER_DRIVER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interface: 'puter-chat-completion',
        service: 'openai',
        method: 'complete',
        args: driverArgs,
      }),
    });
  } catch (err: unknown) {
    logger.error('[PuterBridge] Proxy: fetch to Puter failed:', (err as Error).message);
    return {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Upstream Puter API unreachable', type: 'api_error' } }),
    };
  }

  if (!puterResponse.ok) {
    const errBody = await puterResponse.text();
    logger.error(`[PuterBridge] Proxy: Puter returned ${puterResponse.status}: ${errBody}`);
    return { status: puterResponse.status, headers: { 'Content-Type': 'application/json' }, body: errBody };
  }

  // Pass SSE stream straight through
  if (isStream) {
    const sseBody = await puterResponse.text();
    return {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
      body: sseBody,
    };
  }

  // Non-streaming: unwrap Puter's { success, result } envelope → OpenAI format
  let puterBody: { success: boolean; result?: unknown; error?: string };
  try {
    puterBody = await puterResponse.json() as typeof puterBody;
  } catch {
    return {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Invalid JSON from Puter API', type: 'api_error' } }),
    };
  }

  if (!puterBody.success || puterBody.result == null) {
    return {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: puterBody.error ?? 'Puter API returned failure', type: 'api_error' } }),
    };
  }

  const result = puterBody.result as Record<string, unknown>;
  const openAIResponse = result['choices'] != null ? result : {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: rawModel,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: typeof result['content'] === 'string'
          ? result['content']
          : String((result['message'] as Record<string, unknown> | undefined)?.['content'] ?? ''),
      },
      finish_reason: result['finish_reason'] ?? 'stop',
    }],
    usage: result['usage'] ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(openAIResponse),
  };
}

// ---------------------------------------------------------------------------
// OpenClaw plugin default export — consumed by the plugin loader
// ---------------------------------------------------------------------------

export default {
  id: 'puter-bridge',

  register(api: OpenClawPluginApi): void {
    const pluginConfig = (api.pluginConfig ?? {}) as Partial<PuterBridgeConfig>;

    // 1. Register HTTP proxy handler
    //    Intercepts requests OpenClaw sends to PUTER_PROXY_BASE_URL and
    //    translates them into Puter's /drivers/call format.
    if (typeof api.registerHttpHandler === 'function') {
      const configRef = new Config(pluginConfig);
      api.registerHttpHandler(async (req: HttpRequest) =>
        handleProxyRequest(req, () => configRef.getAuthToken(), api.logger),
      );
      api.logger.info('[PuterBridge] HTTP proxy handler registered');
    } else {
      api.logger.warn('[PuterBridge] api.registerHttpHandler not available on this OpenClaw version');
    }

    // 2. Register provider — makes all 55+ models visible to OpenClaw agents
    api.registerProvider({
      id: 'puter',
      label: 'Puter AI (500+ Free Models)',
      docsPath: '/providers/puter',
      aliases: ['pt'],
      envVars: ['PUTER_AUTH_TOKEN'],
      models: {
        baseUrl: PUTER_PROXY_BASE_URL,
        api: 'openai-completions',
        models: PROVIDER_MODELS,
      },
      auth: [{
        id: 'bearer-token',
        label: 'Puter Bearer Token',
        hint: 'Paste your Puter JWT (from puter.com browser console)',
        kind: 'api_key',
        run: async (ctx: ProviderAuthContext) => {
          // Non-interactive: try env var / file first
          const envToken = process.env.PUTER_AUTH_TOKEN?.trim();
          const fileToken = (() => {
            const p = path.join(os.homedir(), '.openclaw', 'puter-token.txt');
            try { return fs.readFileSync(p, 'utf-8').trim() || null; } catch { return null; }
          })();

          let token = envToken ?? fileToken ?? '';

          if (!token) {
            token = await ctx.prompter.text({
              message: 'Enter your Puter bearer token',
              validate: (v: string) => v?.trim() ? undefined : 'Token is required',
            });
          }

          token = token.trim();

          return {
            profiles: [{
              profileId: 'puter:default',
              credential: { type: 'api_key', provider: 'puter', key: token },
            }],
            configPatch: {
              models: {
                providers: {
                  puter: { baseUrl: PUTER_PROXY_BASE_URL, api: 'openai-completions', models: PROVIDER_MODELS },
                },
              },
              agents: { defaults: { models: MODEL_ALIASES } },
            },
            defaultModel: 'puter/openai/gpt-5-nano',
            notes: [
              `✓ ${SUPPORTED_MODELS.length} Puter models configured`,
              'Default: puter/openai/gpt-5-nano',
              'Usage: openclaw agent --model puter/openai/gpt-5-nano --message "Hello"',
            ],
          };
        },
      }],
    });

    api.logger.info(`[PuterBridge] Provider registered — ${SUPPORTED_MODELS.length} models available`);

    // 3. Sync token pre-check + async internal init
    const syncConfig = new Config(pluginConfig);
    const token = syncConfig.getAuthToken();

    if (!token) {
      api.logger.warn(
        '[PuterBridge] No token at startup. Run: openclaw models auth login --provider puter',
      );
      return;
    }

    api.logger.info(`[PuterBridge] Token found — default model: ${syncConfig.getDefaultModel()}`);

    initialize(pluginConfig)
      .then(() => api.logger.info(`[PuterBridge] Ready — ${SUPPORTED_MODELS.length} models available`))
      .catch((err: unknown) => api.logger.error('[PuterBridge] Init failed:', (err as Error).message));
  },
};

// ---------------------------------------------------------------------------
// Internal initialisation (also used by tests and direct programmatic usage)
// ---------------------------------------------------------------------------

export async function initialize(config?: Partial<PuterBridgeConfig>): Promise<void> {
  const configObj = new Config(config ?? {});
  const validation = configObj.validate();
  if (!validation.valid) {
    validation.errors.forEach(err => console.error(`[PuterBridge]  - ${err}`));
    throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
  }
  modelProvider = createModelProvider(configObj);
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    console.error(`[PuterBridge] ERROR: Node.js ${process.versions.node} requires >= 18.0.0`);
  }
}

export function getModelProvider(): ModelProvider | null { return modelProvider; }
export function getManifest(): PluginManifest { return manifest; }

export { Config } from './config';
export { createModelProvider, ModelProvider } from './model-provider';
export { SUPPORTED_MODELS };
export * from './types';
