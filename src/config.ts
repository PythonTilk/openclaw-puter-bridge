import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PuterBridgeConfig, SUPPORTED_MODELS } from './types';

const DEFAULT_CONFIG: PuterBridgeConfig = {
  defaultModel: 'puter/openai/gpt-5-nano',
  apiUrl: 'https://api.puter.com',
};

const DEFAULT_AUTH_TOKEN_PATH = path.join(os.homedir(), '.openclaw', 'puter-token.txt');

/** MAJ-08: expand a leading `~` to the user's home directory. */
function expandTilde(filePath: string): string {
  if (filePath === '~' || filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

export class Config {
  private config: PuterBridgeConfig;
  // CRIT-05: cache token alongside the file's mtime so stale values are invalidated
  private fileTokenCache: { token: string; mtimeMs: number } | null = null;

  constructor(userConfig: Partial<PuterBridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...userConfig };
  }

  /** Type-safe generic accessor. */
  get<K extends keyof PuterBridgeConfig>(key: K): PuterBridgeConfig[K] {
    return this.config[key];
  }

  /**
   * Resolve the auth token using the priority chain:
   *   1. Inline `authToken` in the config object
   *   2. File at `authTokenPath` (re-read whenever the file changes on disk)
   *   3. `PUTER_AUTH_TOKEN` environment variable
   */
  getAuthToken(): string | null {
    // 1. Inline token — highest priority, no caching needed
    if (this.config.authToken) {
      return this.config.authToken;
    }

    // 2. File-based token with mtime invalidation (fixes CRIT-05 + MAJ-08 + MIN-16)
    const rawPath = this.config.authTokenPath ?? DEFAULT_AUTH_TOKEN_PATH;
    const tokenPath = expandTilde(rawPath);

    try {
      // MIN-16: avoid TOCTOU — stat then read directly, handle ENOENT in catch
      const stat = fs.statSync(tokenPath);
      const mtimeMs = stat.mtimeMs;

      if (this.fileTokenCache && this.fileTokenCache.mtimeMs === mtimeMs) {
        return this.fileTokenCache.token; // file unchanged — return cached value
      }

      // File is new or modified — re-read
      const token = fs.readFileSync(tokenPath, 'utf-8').trim();
      if (token) {
        this.fileTokenCache = { token, mtimeMs };
        return token;
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error(`[PuterBridge] Failed to read auth token from ${tokenPath}:`, err);
      }
    }

    // 3. Environment variable
    return process.env.PUTER_AUTH_TOKEN ?? null;
  }

  getDefaultModel(): string {
    return this.config.defaultModel ?? 'puter/openai/gpt-5-nano';
  }

  getApiUrl(): string {
    return this.config.apiUrl ?? 'https://api.puter.com';
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.getAuthToken()) {
      errors.push(
        'No authentication token found. ' +
        'Set authToken, authTokenPath, or the PUTER_AUTH_TOKEN environment variable.',
      );
    }

    // MAJ-01: derive valid IDs from SUPPORTED_MODELS — single source of truth
    const validIds = SUPPORTED_MODELS.map(m => m.id);
    const defaultModel = this.getDefaultModel();
    if (!validIds.includes(defaultModel)) {
      errors.push(
        `Invalid defaultModel: "${defaultModel}". ` +
        `Must be one of: ${validIds.join(', ')}`,
      );
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON(): PuterBridgeConfig {
    return { ...this.config };
  }
}

export function loadConfig(configPath?: string): Config {
  if (configPath) {
    try {
      // MIN-16: read directly, handle ENOENT in catch
      const content = fs.readFileSync(configPath, 'utf-8');
      return new Config(JSON.parse(content) as Partial<PuterBridgeConfig>);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error(`[PuterBridge] Failed to load config from ${configPath}:`, err);
      }
    }
  }
  return new Config();
}
