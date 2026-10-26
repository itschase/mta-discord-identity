import assert from 'node:assert/strict';
import test from 'node:test';
import { DiscordProvider, createPkce } from '../service/src/discord-provider.js';

const config = { clientId: '123', guildId: '456', redirectUri: 'https://identity.test/v1/oauth/discord/callback', requestTimeoutMs: 5000 };
const secrets = { clientSecret: 'server-client-secret', botToken: 'server-bot-token' };
const response = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('PKCE verifier and S256 challenge are URL-safe and distinct', () => {
  const pkce = createPkce();
  assert.match(pkce.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(pkce.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(pkce.verifier, pkce.challenge);
});

test('authorization URL binds exact redirect, state, and S256 challenge', () => {
  const provider = new DiscordProvider(config, secrets, async () => assert.fail('fetch not expected'));
  const url = new URL(provider.authorizationUrl('exact-state', 'pkce-challenge'));
  assert.equal(url.origin + url.pathname, 'https://discord.com/oauth2/authorize');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    response_type: 'code', client_id: '123', scope: 'identify', state: 'exact-state',
    redirect_uri: config.redirectUri, code_challenge: 'pkce-challenge', code_challenge_method: 'S256'
  });
});

test('authorization code exchange uses server credentials and current bot-resolved roles', async () => {
  const calls = [];
  const provider = new DiscordProvider(config, secrets, async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/oauth2/token')) return response(200, { access_token: 'oauth-access', token_type: 'Bearer' });
    if (url.endsWith('/users/@me')) return response(200, { id: '789' });
    if (url.endsWith('/guilds/456/members/789')) return response(200, { roles: ['100', '200'] });
    return response(404, {});
  });
  const identity = await provider.completeAuthorization('one-use-code', 'exact-verifier');
  assert.deepEqual(identity, { discordSubject: '789', roleIds: ['100', '200'] });
  assert.equal(calls[0].options.headers.authorization, `Basic ${Buffer.from('123:server-client-secret').toString('base64')}`);
  assert.equal(new URLSearchParams(calls[0].options.body).get('code_verifier'), 'exact-verifier');
  assert.equal(calls[1].options.headers.authorization, 'Bearer oauth-access');
  assert.equal(calls[2].options.headers.authorization, 'Bot server-bot-token');
  assert.equal(JSON.stringify(identity).includes('server-'), false);
});

test('absent guild member is an explicit revocation', async () => {
  const provider = new DiscordProvider(config, secrets, async () => response(404, { message: 'Unknown Member' }));
  await assert.rejects(provider.resolveRoles('789'), { code: 'GUILD_MEMBERSHIP_REVOKED', status: 403 });
});
