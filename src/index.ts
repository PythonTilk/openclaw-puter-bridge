import { Config } from './config';
import { createModelProvider, ModelProvider } from './model-provider';
import { SUPPORTED_MODELS, PuterBridgeConfig } from './types';

// MIN-08: load manifest from openclaw.plugin.json — single source of truth.
// resolveJsonModule is enabled in tsconfig so this import works at compile time.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pluginManifestJson = require('../openclaw.plugin.json') as {
  id: string;
  name: string;
  description: string;
  version: string;
  main: string;
  configSchema: {
    type: string;
    properties: Record<string, unknown>;
  };
};

export type PluginManifest = typeof pluginManifestJson;

export interface OpenClawPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  // MAJ-04: typed config param instead of `any`
  initialize: (config: Partial<PuterBridgeConfig>) => Promise<void>;
  getModelProvider?: () => ModelProvider;
}

let pluginInstance: OpenClawPlugin | null = null;
let modelProvider: ModelProvider | null = null;

/** Plugin manifest — loaded directly from openclaw.plugin.json. */
export const manifest: PluginManifest = pluginManifestJson;

export async function initialize(config?: Partial<PuterBridgeConfig>): Promise<void> {
  // MAJ-05: tear down any previous instance cleanly before re-initialising
  if (pluginInstance) {
    console.log('[PuterBridge] Re-initialising plugin…');
    pluginInstance = null;
    modelProvider = null;
  }

  const configObj = new Config(config ?? {});

  const validation = configObj.validate();
  if (!validation.valid) {
    console.error('[PuterBridge] Configuration validation failed:');
    validation.errors.forEach(err => console.error(`  - ${err}`));
    throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
  }

  modelProvider = createModelProvider(configObj);

  pluginInstance = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    initialize: async (cfg: Partial<PuterBridgeConfig>) => {
      const newConfig = new Config(cfg);
      const v = newConfig.validate();
      if (!v.valid) {
        throw new Error(`Configuration validation failed: ${v.errors.join(', ')}`);
      }
      modelProvider = createModelProvider(newConfig);
    },
    getModelProvider: () => modelProvider as ModelProvider,
  };

  // CRIT-04 defence-in-depth: warn if running on an unsupported Node version
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    console.error(
      `[PuterBridge] ERROR: Node.js ${process.versions.node} detected. ` +
      'This plugin requires Node.js >= 18.0.0 for streaming support.',
    );
  }

  console.log('[PuterBridge] Plugin initialised successfully');
  console.log(`[PuterBridge] Default model: ${configObj.getDefaultModel()}`);
  console.log(`[PuterBridge] Available models: ${SUPPORTED_MODELS.length}`);
}

export function getPlugin(): OpenClawPlugin | null {
  return pluginInstance;
}

export function getModelProvider(): ModelProvider | null {
  return modelProvider;
}

export function getManifest(): PluginManifest {
  return manifest;
}

export { Config } from './config';
export { createModelProvider, ModelProvider } from './model-provider';
export { SUPPORTED_MODELS };
export * from './types';

// ---------------------------------------------------------------------------
// OpenClaw plugin loader entry point
//
// The loader calls resolvePluginModuleExport(mod) and then checks:
//   const register = def.register ?? def.activate
//   if (typeof register !== 'function') → error
//
// Rules:
//   - register() MUST be synchronous (the loader ignores returned Promises)
//   - api.pluginConfig contains the validated per-plugin config block
//   - api.logger is available for structured logging
// ---------------------------------------------------------------------------

interface OpenClawPluginApi {
  pluginConfig?: unknown;
  logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

// eslint-disable-next-line import/no-default-export
export default {
  id: 'puter-bridge',

  register(api: OpenClawPluginApi): void {
    const config = (api.pluginConfig ?? {}) as Partial<PuterBridgeConfig>;

    // Synchronous pre-check: verify a token is resolvable before going async.
    // getAuthToken() reads from config object, file, or env var — all sync.
    const syncConfig = new Config(config);
    const token = syncConfig.getAuthToken();

    if (!token) {
      api.logger.error(
        '[PuterBridge] No auth token found. ' +
        'Set authToken, authTokenPath, or the PUTER_AUTH_TOKEN environment variable. ' +
        'Plugin will not function until a token is provided.',
      );
      return; // bail — don't fire async init with a missing token
    }

    api.logger.info(`[PuterBridge] Token found, initialising with model: ${syncConfig.getDefaultModel()}`);

    // Fire-and-forget async initialisation.
    // register() must be sync so we log errors via api.logger instead of throwing.
    initialize(config)
      .then(() => {
        api.logger.info(`[PuterBridge] Ready — ${SUPPORTED_MODELS.length} models available`);
      })
      .catch((err: unknown) => {
        api.logger.error('[PuterBridge] Initialisation failed:', (err as Error).message ?? err);
      });
  },
};
