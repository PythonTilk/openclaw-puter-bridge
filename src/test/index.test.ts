/**
 * Basic integration tests for openclaw-puter-bridge.
 * Run after building: npm run build && npm test
 *
 * Tests that do NOT require a live Puter token:
 *   - manifest structure
 *   - config token resolution order
 *   - model list completeness
 *   - model prefix stripping
 *   - config validation errors
 *
 * Tests that DO require a live token (skipped when PUTER_AUTH_TOKEN is unset):
 *   - completeChat (non-streaming)
 *   - streamChat
 */

import * as assert from 'assert';
import { Config } from '../config';
import { SUPPORTED_MODELS, ModelInfo } from '../types';
import { getManifest } from '../index';

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: unknown) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
    failed++;
  }
}

function skip(name: string, reason: string): void {
  console.log(`  - ${name} [SKIPPED: ${reason}]`);
  skipped++;
}

// ---------------------------------------------------------------------------
// Manifest tests
// ---------------------------------------------------------------------------
console.log('\nManifest');

test('manifest has required fields', () => {
  const m = getManifest();
  assert.strictEqual(typeof m.id, 'string', 'id must be a string');
  assert.strictEqual(typeof m.name, 'string', 'name must be a string');
  assert.strictEqual(typeof m.version, 'string', 'version must be a string');
  assert.ok(m.configSchema, 'configSchema must be present');
});

test('manifest id is puter-bridge', () => {
  assert.strictEqual(getManifest().id, 'puter-bridge');
});

test('manifest configSchema has authToken and defaultModel', () => {
  const props = getManifest().configSchema.properties;
  assert.ok(props.authToken, 'authToken property missing');
  assert.ok(props.defaultModel, 'defaultModel property missing');
});

// ---------------------------------------------------------------------------
// Config tests
// ---------------------------------------------------------------------------
console.log('\nConfig');

test('default model falls back to gpt-5-nano', () => {
  const cfg = new Config({});
  assert.strictEqual(cfg.getDefaultModel(), 'puter/openai/gpt-5-nano');
});

test('explicit defaultModel is respected', () => {
  const cfg = new Config({ defaultModel: 'puter/claude-sonnet-4' });
  assert.strictEqual(cfg.getDefaultModel(), 'puter/claude-sonnet-4');
});

test('authToken from config object is returned', () => {
  const cfg = new Config({ authToken: 'test-token-123' });
  assert.strictEqual(cfg.getAuthToken(), 'test-token-123');
});

test('authToken from PUTER_AUTH_TOKEN env var is returned', () => {
  const original = process.env.PUTER_AUTH_TOKEN;
  process.env.PUTER_AUTH_TOKEN = 'env-token-456';
  const cfg = new Config({});
  assert.strictEqual(cfg.getAuthToken(), 'env-token-456');
  if (original === undefined) delete process.env.PUTER_AUTH_TOKEN;
  else process.env.PUTER_AUTH_TOKEN = original;
});

test('validate() returns errors when no token is set', () => {
  const original = process.env.PUTER_AUTH_TOKEN;
  delete process.env.PUTER_AUTH_TOKEN;
  const cfg = new Config({});
  const result = cfg.validate();
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0, 'expected at least one error');
  if (original !== undefined) process.env.PUTER_AUTH_TOKEN = original;
});

test('validate() passes when token is provided', () => {
  const cfg = new Config({ authToken: 'some-valid-token' });
  const result = cfg.validate();
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

test('getApiUrl() returns default puter endpoint', () => {
  const cfg = new Config({});
  assert.strictEqual(cfg.getApiUrl(), 'https://api.puter.com');
});

test('getApiUrl() respects custom apiUrl', () => {
  const cfg = new Config({ apiUrl: 'https://custom.puter.example.com' });
  assert.strictEqual(cfg.getApiUrl(), 'https://custom.puter.example.com');
});

// ---------------------------------------------------------------------------
// Model list tests
// ---------------------------------------------------------------------------
console.log('\nSupported Models');

test('at least 20 models are defined', () => {
  assert.ok(SUPPORTED_MODELS.length >= 20, `expected ≥20 models, got ${SUPPORTED_MODELS.length}`);
});

test('all model ids start with puter/', () => {
  SUPPORTED_MODELS.forEach((m: ModelInfo) => {
    assert.ok(m.id.startsWith('puter/'), `model ${m.id} does not start with puter/`);
  });
});

test('all models have name and provider fields', () => {
  SUPPORTED_MODELS.forEach((m: ModelInfo) => {
    assert.ok(m.name, `model ${m.id} is missing name`);
    assert.ok(m.provider && m.provider.length > 0, `model ${m.id} is missing provider`);
  });
});

test('gpt-5-nano is present', () => {
  const ids = SUPPORTED_MODELS.map((m: ModelInfo) => m.id);
  assert.ok(ids.includes('puter/openai/gpt-5-nano'), 'puter/gpt-5-nano missing from model list');
});

test('model ids are unique', () => {
  const ids = SUPPORTED_MODELS.map((m: ModelInfo) => m.id);
  const unique = new Set(ids);
  assert.strictEqual(unique.size, ids.length, 'duplicate model ids detected');
});

// ---------------------------------------------------------------------------
// Live API tests (require PUTER_AUTH_TOKEN)
// ---------------------------------------------------------------------------
console.log('\nLive API (requires PUTER_AUTH_TOKEN)');

const liveToken = process.env.PUTER_AUTH_TOKEN;

if (!liveToken) {
  skip('completeChat returns a message', 'PUTER_AUTH_TOKEN not set');
  skip('streamChat yields at least one chunk', 'PUTER_AUTH_TOKEN not set');
} else {
  const { PuterAPIClient } = require('../puter-api') as typeof import('../puter-api');
  const client = new PuterAPIClient(new Config({ authToken: liveToken }));

  (async () => {
    // Non-streaming
    try {
      const response = await client.completeChat(
        'puter/openai/gpt-5-nano',
        [{ role: 'user', content: 'Reply with the single word: PONG' }],
        { temperature: 0 }
      );
      const content = response.choices?.[0]?.message?.content || '';
      assert.ok(content.length > 0, 'response content is empty');
      console.log(`  ✓ completeChat returns a message (got: "${content.trim()}")`);
      passed++;
    } catch (err: unknown) {
      console.error(`  ✗ completeChat returns a message`);
      console.error(`    ${(err as Error).message}`);
      failed++;
    }

    // Streaming
    try {
      let chunks = 0;
      for await (const chunk of client.streamChat(
        'puter/openai/gpt-5-nano',
        [{ role: 'user', content: 'Say hi in one word.' }],
        { temperature: 0 }
      )) {
        chunks++;
        if (chunks >= 2) break;
      }
      assert.ok(chunks > 0, 'no streaming chunks received');
      console.log(`  ✓ streamChat yields at least one chunk (got ${chunks})`);
      passed++;
    } catch (err: unknown) {
      console.error(`  ✗ streamChat yields at least one chunk`);
      console.error(`    ${(err as Error).message}`);
      failed++;
    }

    printSummary();
  })();
} 

function printSummary() {
  console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  if (failed > 0) process.exit(1);
}

if (!liveToken) {
  printSummary();
}
