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

export const SUPPORTED_MODELS: ModelInfo[] = [
  { id: 'puter/gpt-5-nano', name: 'GPT-5 Nano', provider: 'Puter', context_window: 128000 },
  { id: 'puter/gpt-5', name: 'GPT-5', provider: 'Puter', context_window: 128000 },
  { id: 'puter/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'Puter', context_window: 1000000 },
  { id: 'puter/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Puter', context_window: 1000000 },
  { id: 'puter/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Puter', context_window: 2000000 },
  { id: 'puter/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Puter', context_window: 200000 },
  { id: 'puter/claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Puter', context_window: 200000 },
  { id: 'puter/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Puter', context_window: 200000 },
  { id: 'puter/claude-3-opus', name: 'Claude 3 Opus', provider: 'Puter', context_window: 200000 },
  { id: 'puter/deepseek-r1', name: 'DeepSeek R1', provider: 'Puter', context_window: 64000 },
  { id: 'puter/deepseek-v3', name: 'DeepSeek V3', provider: 'Puter', context_window: 64000 },
  { id: 'puter/llama-3.1-405b', name: 'Llama 3.1 405B', provider: 'Puter', context_window: 128000 },
  { id: 'puter/llama-3.1-70b', name: 'Llama 3.1 70B', provider: 'Puter', context_window: 128000 },
  { id: 'puter/llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Puter', context_window: 128000 },
  { id: 'puter/mistral-large', name: 'Mistral Large', provider: 'Puter', context_window: 128000 },
  { id: 'puter/mistral-small', name: 'Mistral Small', provider: 'Puter', context_window: 128000 },
  { id: 'puter/qwen-2.5-72b', name: 'Qwen 2.5 72B', provider: 'Puter', context_window: 32768 },
  { id: 'puter/grok-2', name: 'Grok 2', provider: 'Puter', context_window: 131072 },
  { id: 'puter/grok-2-vision', name: 'Grok 2 Vision', provider: 'Puter', context_window: 131072 },
  { id: 'puter/command-r-plus', name: 'Command R Plus', provider: 'Puter', context_window: 128000 },
];
