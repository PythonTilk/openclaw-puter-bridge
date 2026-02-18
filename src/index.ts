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
