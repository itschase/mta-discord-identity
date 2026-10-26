import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRuntimeSecrets, validateConfig } from '../service/src/config.js';
import { fixture } from './helpers.js';

test('runtime secrets are injected from named environment variables', () => {
  const { config } = fixture();
  config.installation = { ...config.installation, secret: undefined, secretEnv: 'INSTALL_SECRET' };
  const runtime = resolveRuntimeSecrets(config, { INSTALL_SECRET: 'i'.repeat(32), TEST_CLIENT_SECRET: 'client-secret', TEST_BOT_TOKEN: 'bot-token' });
  assert.equal(runtime.installation.secret, 'i'.repeat(32));
  assert.deepEqual(runtime.discordSecrets, { clientSecret: 'client-secret', botToken: 'bot-token' });
  assert.equal(JSON.stringify(config).includes('client-secret'), false);
});

test('configuration requires the exact HTTPS callback and blocks development provider in production', () => {
  const { config } = fixture();
  assert.equal(validateConfig(config), true);
  assert.throws(() => validateConfig({ ...config, discord: { ...config.discord, redirectUri: 'https://identity.test/other' } }), /exactly equal/);
  assert.throws(() => validateConfig({ ...config, environment: 'production' }), /cannot be enabled/);
});
