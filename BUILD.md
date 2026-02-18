# Build Instructions

## Prerequisites

- Node.js 18+
- npm 9+

## Quick Start

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Watch for changes (development)
npm run dev
```

## Build Output

After building, the compiled JavaScript will be in the `dist/` directory:

```
dist/
├── index.js
├── index.d.ts
├── index.js.map
├── config.js
├── config.d.ts
├── config.js.map
├── auth.js
├── auth.d.ts
├── auth.js.map
├── puter-api.js
├── puter-api.d.ts
├── puter-api.js.map
├── model-provider.js
├── model-provider.d.ts
├── model-provider.js.map
├── types.js
├── types.d.ts
└── types.js.map
```

## TypeScript Configuration

The project uses `tsconfig.json` targeting ES2020 with CommonJS modules.

## Development

For development with auto-rebuild:

```bash
npm run dev
```

This will watch for file changes and rebuild automatically.

## Clean Build

To do a clean build:

```bash
npm run clean
npm run build
```

## Integration with OpenClaw

1. Build the plugin: `npm run build`
2. Configure OpenClaw to load the plugin (see README.md)
3. Restart OpenClaw gateway

## Testing

Run the full test suite (the `pretest` npm hook runs `tsc` first automatically):

```bash
npm test
```

Smoke-test the manifest and model list without a Puter token:

```bash
npm run build
node -e "
const { getManifest, SUPPORTED_MODELS } = require('./dist/index');
const m = getManifest();
console.log('Plugin ID   :', m.id);
console.log('Version     :', m.version);
console.log('Model count :', SUPPORTED_MODELS.length);
console.log('Manifest OK :', !!m.configSchema);
"
```

Live API test (requires a valid Puter token):

```bash
PUTER_AUTH_TOKEN=<your-token> npm test
```
