export interface PuterAuthToken {
  token: string;
  expiresAt?: number;
}

export interface PuterDriverRequest {
  interface: string;
  service: string;
  method: string;
  args: Record<string, unknown>;
}

export interface PuterDriverResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  error_code?: string;
}

export interface OpenAICompatibleMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
  content: string;
}

export interface OpenAICompatibleRequest {
  model: string;
  messages: OpenAICompatibleMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stream_options?: {
    include_usage?: boolean;
  };
}

export interface OpenAICompatibleResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAICompatibleStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      role?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface PuterBridgeConfig {
  authToken?: string;
  authTokenPath?: string;
  defaultModel?: string;
  apiUrl?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context_window?: number;
}

// ---------------------------------------------------------------------------
// Supported chat-completion models
//
// ID format:  puter/<real-puter-model-id>
//   e.g.  puter/openai/gpt-5-nano  →  real Puter ID: openai/gpt-5-nano
//
// mapModelToPuter() in puter-api.ts strips the leading "puter/" to get the
// bare Puter driver model name passed in args.model.
//
// Last verified: February 2026 against https://developer.puter.com/ai/models/
// ---------------------------------------------------------------------------
export const SUPPORTED_MODELS: ModelInfo[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────────
  { id: 'puter/openai/gpt-5-nano',     name: 'GPT-5 Nano',           provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-5',          name: 'GPT-5',                provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-5-mini',     name: 'GPT-5 Mini',           provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-5.1',        name: 'GPT-5.1',              provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-5.2',        name: 'GPT-5.2',              provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-4.1',        name: 'GPT-4.1',              provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-4.1-mini',   name: 'GPT-4.1 Mini',         provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-4.1-nano',   name: 'GPT-4.1 Nano',         provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-4o',         name: 'GPT-4o',               provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-4o-mini',    name: 'GPT-4o Mini',          provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/o3',             name: 'o3',                   provider: 'OpenAI',     context_window: 200000  },
  { id: 'puter/openai/o4-mini',        name: 'o4-mini',              provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-oss-120b',   name: 'GPT OSS 120B',         provider: 'OpenAI',     context_window: 128000  },
  { id: 'puter/openai/gpt-oss-20b',    name: 'GPT OSS 20B',          provider: 'OpenAI',     context_window: 128000  },

  // ── Anthropic ───────────────────────────────────────────────────────────
  { id: 'puter/anthropic/claude-opus-4-6',    name: 'Claude Opus 4.6',    provider: 'Anthropic', context_window: 200000 },
  { id: 'puter/anthropic/claude-sonnet-4-6',  name: 'Claude Sonnet 4.6',  provider: 'Anthropic', context_window: 1000000 },
  { id: 'puter/anthropic/claude-sonnet-4',    name: 'Claude Sonnet 4',    provider: 'Anthropic', context_window: 200000 },
  { id: 'puter/anthropic/claude-opus-4',      name: 'Claude Opus 4',      provider: 'Anthropic', context_window: 200000 },
  { id: 'puter/anthropic/claude-opus-4-1',    name: 'Claude Opus 4.1',    provider: 'Anthropic', context_window: 200000 },
  { id: 'puter/anthropic/claude-sonnet-4-5',  name: 'Claude Sonnet 4.5',  provider: 'Anthropic', context_window: 200000 },
  { id: 'puter/anthropic/claude-haiku-4-5',   name: 'Claude Haiku 4.5',   provider: 'Anthropic', context_window: 200000 },
  { id: 'puter/anthropic/claude-3-5-sonnet',  name: 'Claude 3.5 Sonnet',  provider: 'Anthropic', context_window: 200000 },
  { id: 'puter/anthropic/claude-3-haiku',     name: 'Claude 3 Haiku',     provider: 'Anthropic', context_window: 200000 },

  // ── Google ──────────────────────────────────────────────────────────────
  { id: 'puter/google/gemini-3-pro-preview',         name: 'Gemini 3 Pro',          provider: 'Google', context_window: 1000000 },
  { id: 'puter/google/gemini-3-flash-preview',       name: 'Gemini 3 Flash',        provider: 'Google', context_window: 1000000 },
  { id: 'puter/google/gemini-2.5-pro',               name: 'Gemini 2.5 Pro',        provider: 'Google', context_window: 1000000 },
  { id: 'puter/google/gemini-2.5-flash',             name: 'Gemini 2.5 Flash',      provider: 'Google', context_window: 1000000 },
  { id: 'puter/google/gemini-2.5-flash-lite',        name: 'Gemini 2.5 Flash Lite', provider: 'Google', context_window: 1000000 },
  { id: 'puter/google/gemini-2.0-flash',             name: 'Gemini 2.0 Flash',      provider: 'Google', context_window: 1000000 },
  { id: 'puter/google/gemini-2.0-flash-lite',        name: 'Gemini 2.0 Flash Lite', provider: 'Google', context_window: 1000000 },

  // ── DeepSeek ────────────────────────────────────────────────────────────
  { id: 'puter/deepseek/deepseek-r1',          name: 'DeepSeek R1',          provider: 'DeepSeek', context_window: 64000  },
  { id: 'puter/deepseek/deepseek-r1-0528',     name: 'DeepSeek R1 0528',     provider: 'DeepSeek', context_window: 128000 },
  { id: 'puter/deepseek/deepseek-chat',        name: 'DeepSeek V3 (Chat)',   provider: 'DeepSeek', context_window: 64000  },
  { id: 'puter/deepseek/deepseek-v3.2',        name: 'DeepSeek V3.2',        provider: 'DeepSeek', context_window: 64000  },

  // ── xAI ─────────────────────────────────────────────────────────────────
  { id: 'puter/x-ai/grok-4',           name: 'Grok 4',           provider: 'xAI', context_window: 131072 },
  { id: 'puter/x-ai/grok-4-fast',      name: 'Grok 4 Fast',      provider: 'xAI', context_window: 131072 },
  { id: 'puter/x-ai/grok-3',           name: 'Grok 3',           provider: 'xAI', context_window: 131072 },
  { id: 'puter/x-ai/grok-3-mini',      name: 'Grok 3 Mini',      provider: 'xAI', context_window: 131072 },
  { id: 'puter/x-ai/grok-2-vision-1212', name: 'Grok 2 Vision',  provider: 'xAI', context_window: 131072 },

  // ── Meta Llama ──────────────────────────────────────────────────────────
  { id: 'puter/meta-llama/llama-4-maverick',        name: 'Llama 4 Maverick',  provider: 'Meta', context_window: 1000000 },
  { id: 'puter/meta-llama/llama-4-scout',           name: 'Llama 4 Scout',     provider: 'Meta', context_window: 1000000 },
  { id: 'puter/meta-llama/llama-3.3-70b-instruct',  name: 'Llama 3.3 70B',     provider: 'Meta', context_window: 128000  },
  { id: 'puter/meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B',    provider: 'Meta', context_window: 128000  },

  // ── Mistral ─────────────────────────────────────────────────────────────
  { id: 'puter/mistralai/mistral-large-2512',           name: 'Mistral Large 2512',  provider: 'Mistral', context_window: 128000 },
  { id: 'puter/mistralai/mistral-small-3.2-24b-instruct', name: 'Mistral Small 3.2', provider: 'Mistral', context_window: 128000 },
  { id: 'puter/mistralai/devstral-2512',                name: 'Devstral 2512',       provider: 'Mistral', context_window: 128000 },
  { id: 'puter/mistralai/codestral-2508',               name: 'Codestral 2508',      provider: 'Mistral', context_window: 256000 },

  // ── Qwen ────────────────────────────────────────────────────────────────
  { id: 'puter/qwen/qwen3-235b-a22b',      name: 'Qwen3 235B',       provider: 'Qwen', context_window: 128000 },
  { id: 'puter/qwen/qwen3-32b',            name: 'Qwen3 32B',        provider: 'Qwen', context_window: 128000 },
  { id: 'puter/qwen/qwen3-coder',          name: 'Qwen3 Coder',      provider: 'Qwen', context_window: 256000 },
  { id: 'puter/qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B',   provider: 'Qwen', context_window: 128000 },

  // ── MoonShotAI / Kimi ───────────────────────────────────────────────────
  { id: 'puter/moonshotai/kimi-k2',         name: 'Kimi K2',         provider: 'MoonshotAI', context_window: 128000 },
  { id: 'puter/moonshotai/kimi-k2.5',       name: 'Kimi K2.5',       provider: 'MoonshotAI', context_window: 128000 },
  { id: 'puter/moonshotai/kimi-k2-thinking', name: 'Kimi K2 Thinking', provider: 'MoonshotAI', context_window: 128000 },

  // ── Perplexity ──────────────────────────────────────────────────────────
  { id: 'puter/perplexity/sonar-pro',         name: 'Sonar Pro',          provider: 'Perplexity', context_window: 128000 },
  { id: 'puter/perplexity/sonar-pro-search',  name: 'Sonar Pro Search',   provider: 'Perplexity', context_window: 128000 },

  // ── Cohere ──────────────────────────────────────────────────────────────
  { id: 'puter/cohere/command-a',              name: 'Command A',        provider: 'Cohere', context_window: 256000 },
  { id: 'puter/cohere/command-r-plus-08-2024', name: 'Command R+',       provider: 'Cohere', context_window: 128000 },

  // ── MiniMax ─────────────────────────────────────────────────────────────
  { id: 'puter/minimax/minimax-m2.5', name: 'MiniMax M2.5', provider: 'MiniMax', context_window: 1000000 },

  // ── Microsoft ───────────────────────────────────────────────────────────
  { id: 'puter/microsoft/phi-4', name: 'Phi-4', provider: 'Microsoft', context_window: 16000 },
];
