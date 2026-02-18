import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PuterAuthToken } from './types';

const DEFAULT_TOKEN_PATH = path.join(os.homedir(), '.openclaw', 'puter-auth.json');
const IS_WINDOWS = process.platform === 'win32';

export class AuthHandler {
  private tokenPath: string;
  private cachedToken: PuterAuthToken | null = null;

  constructor(tokenPath?: string) {
    this.tokenPath = tokenPath ?? DEFAULT_TOKEN_PATH;
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    const dir = path.dirname(this.tokenPath);
    try {
      // CRIT-06: wrapped in try/catch so constructor errors are handled gracefully
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

      if (IS_WINDOWS) {
        // mode 0o700 is silently ignored on Windows — warn the user
        console.warn(
          '[PuterBridge] Warning: running on Windows. POSIX file permissions (700/600) ' +
          'cannot be enforced. Protect the token directory via Windows ACLs, or use the ' +
          'PUTER_AUTH_TOKEN environment variable instead.',
        );
      }
    } catch (err: unknown) {
      console.error(
        `[PuterBridge] Failed to create token directory "${dir}":`,
        (err as Error).message,
      );
    }
  }

  async authenticateUser(): Promise<string> {
    console.log('[PuterBridge] To get your Puter auth token:');
    console.log('[PuterBridge]   1. Open https://puter.com in your browser');
    console.log('[PuterBridge]   2. Sign in or create an account');
    console.log('[PuterBridge]   3. Open the browser console (F12)');
    console.log('[PuterBridge]   4. Run: await puter.auth.signIn()');
    console.log('[PuterBridge]   5. Copy the returned token string');
    throw new Error('Manual authentication required. Provide a token via configuration.');
  }

  async getStoredToken(): Promise<PuterAuthToken | null> {
    // Return in-memory cache if still valid
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      return this.cachedToken;
    }
    this.cachedToken = null;

    try {
      // MIN-16: read directly instead of existsSync + readFileSync (TOCTOU)
      const content = fs.readFileSync(this.tokenPath, 'utf-8');
      const tokenData = JSON.parse(content) as PuterAuthToken;

      if (this.isTokenValid(tokenData)) {
        this.cachedToken = tokenData;
        return tokenData;
      }

      console.warn('[PuterBridge] Stored token has expired or is invalid');
      return null;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error('[PuterBridge] Failed to read stored token:', (err as Error).message);
      }
    }

    return null;
  }

  async storeToken(token: string, expiresInSeconds?: number): Promise<void> {
    const tokenData: PuterAuthToken = {
      token,
      expiresAt: expiresInSeconds != null ? Date.now() + expiresInSeconds * 1000 : undefined,
    };

    fs.writeFileSync(this.tokenPath, JSON.stringify(tokenData, null, 2), { mode: 0o600 });
    this.cachedToken = tokenData;
    console.log('[PuterBridge] Token stored successfully');
  }

  isTokenValid(token: PuterAuthToken | null): boolean {
    if (!token?.token) return false;
    // Use >= so a token expiring exactly now is treated as expired
    if (token.expiresAt !== undefined && Date.now() >= token.expiresAt) return false;
    return true;
  }

  async refreshToken(): Promise<void> {
    console.log('[PuterBridge] Token refresh not supported. Please re-authenticate.');
    this.cachedToken = null;

    // MIN-03: ignore errors from unlink (file may already be gone or read-only)
    try {
      fs.unlinkSync(this.tokenPath);
    } catch {
      // already deleted or unwritable — ignore
    }
  }

  getTokenPath(): string {
    return this.tokenPath;
  }
}

export function createAuthHandler(tokenPath?: string): AuthHandler {
  return new AuthHandler(tokenPath);
}
