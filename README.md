# OpenClaw Puter Bridge

Native OpenClaw plugin to access 500+ free AI models via Puter.js.

## Features

- Zero additional resource overhead (runs inside OpenClaw gateway process)
- Access 500+ free AI models through Puter
- Support for streaming and non-streaming completions
- Automatic retry with exponential backoff on rate limits
- Memory footprint: ~5-10MB

## Supported Models

Model IDs use the format `puter/<provider>/<model>` in OpenClaw config.
The `puter/` prefix is stripped before sending to the Puter API.

### Tier 1 — Fast / Free
| OpenClaw model ID | Description |
|---|---|
| `puter/openai/gpt-5-nano` | Fastest GPT-5 variant |
| `puter/google/gemini-2.5-flash-lite` | Google's lightest fast model |
| `puter/google/gemini-2.0-flash-lite` | Gemini 2.0 Flash Lite |
| `puter/anthropic/claude-haiku-4-5` | Anthropic's fast model |
| `puter/meta-llama/llama-3.3-70b-instruct` | Open-weight Llama |

### Tier 2 — Powerful
| OpenClaw model ID | Description |
|---|---|
| `puter/openai/gpt-5` | Full GPT-5 |
| `puter/openai/gpt-5.2` | GPT-5.2 flagship |
| `puter/anthropic/claude-opus-4-6` | Most capable Claude (1M ctx) |
| `puter/anthropic/claude-sonnet-4-6` | Claude Sonnet 4.6 (1M ctx) |
| `puter/google/gemini-3-pro-preview` | Gemini 3 Pro |
| `puter/deepseek/deepseek-r1` | DeepSeek R1 reasoning |
| `puter/x-ai/grok-4` | Grok 4 |
| `puter/meta-llama/llama-4-maverick` | Llama 4 Maverick (1M ctx) |
| `puter/moonshotai/kimi-k2.5` | Kimi K2.5 |
| `puter/qwen/qwen3-235b-a22b` | Qwen3 235B |

Full live list: https://developer.puter.com/ai/models/

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/openclaw-puter-bridge.git
cd openclaw-puter-bridge

# Install dependencies
npm install

# Build the plugin
npm run build
```

## Authentication

### Step 1: Get Puter Auth Token

```bash
# 1. Visit https://puter.com and sign in (or create an account)
# 2. Open the browser console (F12)
# 3. Run:  await puter.auth.signIn()
# 4. Copy the token string from the returned object
```

### Step 2: Store Token

```bash
# Create token file
echo "your-puter-jwt-token" > ~/.openclaw/puter-token.txt
chmod 600 ~/.openclaw/puter-token.txt

# Or use environment variable
export PUTER_AUTH_TOKEN="your-puter-jwt-token"
```

## OpenClaw Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/openclaw-puter-bridge"]
    },
    "entries": {
      "puter-bridge": {
        "enabled": true,
        "config": {
          "authTokenPath": "~/.openclaw/puter-token.txt",
          "defaultModel": "puter/openai/gpt-5-nano"
        }
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "puter/openai/gpt-5-nano",
        "fallbacks": [
          "puter/google/gemini-2.5-flash-lite",
          "puter/anthropic/claude-sonnet-4-6"
        ]
      },
      "models": {
        "puter/openai/gpt-5-nano": {
          "alias": "Puter GPT-5 Nano (Free)"
        },
        "puter/openai/gpt-5": {
          "alias": "Puter GPT-5 (Free)"
        },
        "puter/openai/gpt-5.2": {
          "alias": "Puter GPT-5.2 (Free)"
        },
        "puter/anthropic/claude-sonnet-4-6": {
          "alias": "Puter Claude Sonnet 4.6 (Free)"
        },
        "puter/anthropic/claude-opus-4-6": {
          "alias": "Puter Claude Opus 4.6 (Free)"
        },
        "puter/deepseek/deepseek-r1": {
          "alias": "Puter DeepSeek R1 (Free)"
        },
        "puter/google/gemini-3-pro-preview": {
          "alias": "Puter Gemini 3 Pro (Free)"
        },
        "puter/google/gemini-2.5-flash-lite": {
          "alias": "Puter Gemini 2.5 Flash Lite (Free)"
        },
        "puter/x-ai/grok-4": {
          "alias": "Puter Grok 4 (Free)"
        },
        "puter/meta-llama/llama-4-maverick": {
          "alias": "Puter Llama 4 Maverick (Free)"
        }
      }
    }
  }
}
```

## Usage

```bash
# Restart OpenClaw
docker restart openclaw-openclaw-gateway-1

# Send test message
echo "Hello, what models do you have access to?" | openclaw chat

# List available models
openclaw models list | grep puter

# Test streaming
openclaw chat --stream "Write a story about AI"
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authToken` | string | - | Puter JWT auth token |
| `authTokenPath` | string | `~/.openclaw/puter-token.txt` | Path to token file (`~` is expanded) |
| `defaultModel` | string | `puter/gpt-5-nano` | Default model to use |
| `apiUrl` | string | `https://api.puter.com` | Puter API endpoint |

## Security

- Token stored with 600 permissions on Unix (owner read/write only)
- **Windows**: POSIX file permissions cannot be enforced. Use Windows ACLs or the `PUTER_AUTH_TOKEN` environment variable instead
- Token file is re-read automatically whenever it changes on disk (stale cache is invalidated by mtime)
- Never commit tokens to git

## Troubleshooting

### No authentication token found

Ensure you've set up authentication as described in the Authentication section.

### Rate limiting (429 errors)

The plugin automatically retries with exponential backoff. If you continue to experience issues, wait a moment before making more requests.

### Plugin not loading

Check that the plugin path is correctly configured in `~/.openclaw/openclaw.json` and that the plugin is built.

## License

MIT
