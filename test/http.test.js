import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdentityServer } from '../service/src/server.js';
import { fixture } from './helpers.js';

async function withServer(run) {
  const f = fixture();
  const server = createIdentityServer(f.config, f.core);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(f, `http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('HTTP contract requires installation authentication', async () => withServer(async (_f, url) => {
  const response = await fetch(`${url}/v1/link-challenges`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId: 'a' }) });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, 'INSTALLATION_UNAUTHORIZED');
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
}));

test('HTTP vertical slice creates, redeems, and exchanges without role leakage', async () => withServer(async (f, url) => {
  const auth = { authorization: `Bearer ${f.config.installation.secret}`, 'content-type': 'application/json' };
  const created = await fetch(`${url}/v1/link-challenges`, { method: 'POST', headers: auth, body: JSON.stringify({ accountId: 'account-1' }) });
  assert.equal(created.status, 201);
  const challenge = await created.json();
  const redeemed = await fetch(`${url}/v1/development/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: challenge.code, discordSubject: 'discordUser' }) });
  const { ticket } = await redeemed.json();
  const exchanged = await fetch(`${url}/v1/sessions/exchange`, { method: 'POST', headers: auth, body: JSON.stringify({ ticket, accountId: 'account-1' }) });
  assert.equal(exchanged.status, 201);
  const session = await exchanged.json();
  assert.deepEqual(session.capabilities, ['staff.reports.view']);
  assert.equal(session.donorTier, 'supporter');
  assert.equal(JSON.stringify(session).includes('100'), false);
}));

test('HTTP pre-auth login requires host activation before a capability session exists', async () => withServer(async (f, url) => {
  const auth = { authorization: `Bearer ${f.config.installation.secret}`, 'content-type': 'application/json' };
  const linkChallenge = await (await fetch(`${url}/v1/link-challenges`, { method: 'POST', headers: auth, body: JSON.stringify({ accountId: 'account-1' }) })).json();
  await fetch(`${url}/v1/development/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: linkChallenge.code, discordSubject: 'discordUser' }) });

  const challengeResponse = await fetch(`${url}/v1/login-challenges`, { method: 'POST', headers: auth, body: JSON.stringify({ connectionGeneration: 7 }) });
  assert.equal(challengeResponse.status, 201);
  const challenge = await challengeResponse.json();
  const loginTicket = await (await fetch(`${url}/v1/development/login/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: challenge.code, discordSubject: 'discordUser' }) })).json();
  const admissionResponse = await fetch(`${url}/v1/login-sessions/exchange`, { method: 'POST', headers: auth, body: JSON.stringify({ ticket: loginTicket.ticket, challengeId: challenge.challengeId, connectionToken: challenge.connectionToken, connectionGeneration: 7 }) });
  assert.equal(admissionResponse.status, 200);
  const admission = await admissionResponse.json();
  assert.equal(admission.accountId, 'account-1');
  assert.equal(typeof admission.sessionTicket, 'string');
  assert.equal(f.store.sessions.size, 0);

  const activatedResponse = await fetch(`${url}/v1/sessions/exchange`, { method: 'POST', headers: auth, body: JSON.stringify({ ticket: admission.sessionTicket, accountId: admission.accountId }) });
  assert.equal(activatedResponse.status, 201);
  const session = await activatedResponse.json();
  assert.deepEqual(session.capabilities, ['staff.reports.view']);
}));

test('browser link flow keeps challenge code out of URLs and renders one-use ticket', async () => {
  const calls = [];
  const core = {
    startDiscordOAuth: async (code) => { calls.push(['start', code]); return { authorizationUrl: 'https://discord.com/oauth2/authorize?state=opaque' }; },
    completeDiscordOAuth: async (state, code) => { calls.push(['complete', state, code]); return { ticket: 'safe_ticket-123' }; },
    denyDiscordOAuth: async (state) => calls.push(['deny', state])
  };
  const config = { installation: { secret: 'a'.repeat(32) } };
  const server = createIdentityServer(config, core);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${url}/link`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /form-action 'self'/);
    const redirect = await fetch(`${url}/link`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'code=user-secret-code' });
    assert.equal(redirect.status, 303);
    assert.equal(redirect.headers.get('location'), 'https://discord.com/oauth2/authorize?state=opaque');
    assert.equal(redirect.headers.get('location').includes('user-secret-code'), false);
    const callback = await fetch(`${url}/v1/oauth/discord/callback?code=discord-code&state=opaque`);
    assert.match(await callback.text(), /safe_ticket-123/);
    assert.deepEqual(calls, [['start', 'user-secret-code'], ['complete', 'opaque', 'discord-code']]);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
