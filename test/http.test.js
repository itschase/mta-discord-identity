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
