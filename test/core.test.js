import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../service/src/util.js';
import { fixture, linkedSession } from './helpers.js';

test('policy exposes allowlisted names and keeps donor tier separate', async () => {
  const f = fixture();
  const session = await linkedSession(f);
  assert.deepEqual(session.capabilities, ['staff.reports.view']);
  assert.equal(session.donorTier, 'supporter');
  assert.equal(JSON.stringify(session).includes('100'), false);
  assert.equal(JSON.stringify(session).includes('300'), false);
});

test('ticket is account-bound and one-use', async () => {
  const f = fixture();
  const challenge = await f.core.createChallenge('account-1');
  const { ticket } = await f.core.redeemDevelopmentChallenge(challenge.code, 'discordUser');
  await assert.rejects(f.core.exchangeTicket(ticket, 'account-2'), { code: 'INVALID_TICKET' });
  await f.core.exchangeTicket(ticket, 'account-1');
  await assert.rejects(f.core.exchangeTicket(ticket, 'account-1'), { code: 'INVALID_TICKET' });
});

test('challenge and ticket expiry are enforced', async () => {
  const f = fixture();
  const challenge = await f.core.createChallenge('account-1');
  f.advance(601);
  await assert.rejects(f.core.redeemDevelopmentChallenge(challenge.code, 'discordUser'), { code: 'INVALID_CHALLENGE' });

  const next = await f.core.createChallenge('account-2');
  const { ticket } = await f.core.redeemDevelopmentChallenge(next.code, 'discordUser');
  f.advance(61);
  await assert.rejects(f.core.exchangeTicket(ticket, 'account-2'), { code: 'INVALID_TICKET' });
});

test('rolling refresh never crosses absolute session expiry', async () => {
  const f = fixture();
  const session = await linkedSession(f);
  f.advance(500);
  let refreshed = await f.core.refreshSession(session.sessionToken);
  assert.equal(refreshed.expiresAt, f.now() + 600);
  for (let index = 0; index < 5; index += 1) {
    f.advance(500);
    refreshed = await f.core.refreshSession(session.sessionToken);
  }
  f.advance(100);
  const finalRefresh = await f.core.refreshSession(session.sessionToken);
  assert.equal(finalRefresh.expiresAt, session.absoluteExpiresAt);
  f.advance(501);
  assert.throws(() => f.core.authenticateSession(session.sessionToken), { code: 'SESSION_INVALID' });
});

test('unlink revokes every session immediately', async () => {
  const f = fixture();
  const session = await linkedSession(f);
  await f.core.unlink('account-1');
  assert.throws(() => f.core.authenticateSession(session.sessionToken), { code: 'SESSION_INVALID' });
});

test('unlink revokes pending challenges and unconsumed tickets', async () => {
  const f = fixture();
  const challenge = await f.core.createChallenge('account-1');
  const { ticket } = await f.core.redeemDevelopmentChallenge(challenge.code, 'discordUser');
  const pending = await f.core.createChallenge('account-1');
  await f.core.unlink('account-1');
  assert.equal((await f.core.challengeStatus(pending.challengeId, 'account-1')).status, 'cancelled');
  await assert.rejects(f.core.exchangeTicket(ticket, 'account-1'), { code: 'INVALID_TICKET' });
});

test('ticket exchange evaluates current policy instead of snapshot grants', async () => {
  const f = fixture();
  const challenge = await f.core.createChallenge('account-1');
  const { ticket } = await f.core.redeemDevelopmentChallenge(challenge.code, 'discordUser');
  f.store.links.get('account-1').roleIds = [];
  const session = await f.core.exchangeTicket(ticket, 'account-1');
  assert.deepEqual(session.capabilities, []);
  assert.equal(session.donorTier, null);
});

test('challenge rate limit is per account and window', async () => {
  const f = fixture({ rateLimits: { windowSeconds: 60, challengeCreatesPerWindow: 1, ticketExchangesPerWindow: 10 } });
  await f.core.createChallenge('account-1');
  await assert.rejects(f.core.createChallenge('account-1'), { code: 'RATE_LIMITED' });
  await f.core.createChallenge('account-2');
  f.advance(60);
  await f.core.createChallenge('account-1');
});

test('audit records form a hash chain', async () => {
  const f = fixture();
  await linkedSession(f);
  assert.ok(f.audit.records.length >= 3);
  for (let index = 0; index < f.audit.records.length; index += 1) {
    const record = f.audit.records[index];
    assert.equal(record.previousHash, index ? f.audit.records[index - 1].hash : '0'.repeat(64));
    const { hash, ...unsigned } = record;
    assert.equal(hash, sha256(JSON.stringify(unsigned)));
  }
});
