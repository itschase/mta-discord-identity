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
  assert.throws(() => f.core.authenticateSession(session.sessionToken), { code: 'IDENTITY_AUTHORIZATION_REVOKED' });
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

test('pre-auth login issues a server-held activation ticket and does not create grants before activation', async () => {
  const f = fixture();
  const link = await f.core.createChallenge('account-1');
  await f.core.redeemDevelopmentChallenge(link.code, 'discordUser');
  const challenge = await f.core.createLoginChallenge(7);
  const { ticket } = await f.core.redeemDevelopmentLoginChallenge(challenge.code, 'discordUser');
  const result = await f.core.exchangeLoginTicket(ticket, challenge.challengeId, challenge.connectionToken, 7);
  assert.equal(result.accountId, 'account-1');
  assert.equal(typeof result.sessionTicket, 'string');
  assert.equal(f.store.sessions.size, 0);
  const session = await f.core.exchangeTicket(result.sessionTicket, result.accountId);
  assert.equal(session.accountId, 'account-1');
  assert.deepEqual(session.capabilities, ['staff.reports.view']);
  assert.equal(f.store.sessions.size, 1);
  await assert.rejects(f.core.exchangeLoginTicket(ticket, challenge.challengeId, challenge.connectionToken, 7), { code: 'INVALID_TICKET' });
  await assert.rejects(f.core.exchangeTicket(result.sessionTicket, result.accountId), { code: 'INVALID_TICKET' });
});

test('pre-auth login rejects another connection generation without consuming the ticket', async () => {
  const f = fixture();
  const link = await f.core.createChallenge('account-1');
  await f.core.redeemDevelopmentChallenge(link.code, 'discordUser');
  const challenge = await f.core.createLoginChallenge(11);
  const { ticket } = await f.core.redeemDevelopmentLoginChallenge(challenge.code, 'discordUser');
  await assert.rejects(f.core.exchangeLoginTicket(ticket, challenge.challengeId, challenge.connectionToken, 12), { code: 'INVALID_TICKET' });
  const result = await f.core.exchangeLoginTicket(ticket, challenge.challengeId, challenge.connectionToken, 11);
  assert.equal(result.accountId, 'account-1');
  assert.equal(typeof result.sessionTicket, 'string');
});

test('pre-auth login rejects another connection token without consuming the ticket', async () => {
  const f = fixture();
  const link = await f.core.createChallenge('account-1');
  await f.core.redeemDevelopmentChallenge(link.code, 'discordUser');
  const challenge = await f.core.createLoginChallenge(13);
  const { ticket } = await f.core.redeemDevelopmentLoginChallenge(challenge.code, 'discordUser');
  await assert.rejects(f.core.exchangeLoginTicket(ticket, challenge.challengeId, 'wrong-connection-token', 13), { code: 'INVALID_TICKET' });
  const result = await f.core.exchangeLoginTicket(ticket, challenge.challengeId, challenge.connectionToken, 13);
  assert.equal(result.accountId, 'account-1');
  assert.equal(typeof result.sessionTicket, 'string');
});

test('pre-auth login fails closed if the linked installation changes before exchange', async () => {
  const f = fixture();
  const link = await f.core.createChallenge('account-1');
  await f.core.redeemDevelopmentChallenge(link.code, 'discordUser');
  const challenge = await f.core.createLoginChallenge(17);
  const { ticket } = await f.core.redeemDevelopmentLoginChallenge(challenge.code, 'discordUser');
  f.store.links.get('account-1').installationId = 'another-installation';
  await assert.rejects(f.core.exchangeLoginTicket(ticket, challenge.challengeId, challenge.connectionToken, 17), { code: 'INVALID_TICKET' });
});

test('pre-auth login does not provision an unlinked Discord identity', async () => {
  const f = fixture();
  const challenge = await f.core.createLoginChallenge(3);
  await assert.rejects(f.core.redeemDevelopmentLoginChallenge(challenge.code, 'discordUser'), { code: 'ACCOUNT_NOT_LINKED' });
});

test('linking prevents one Discord identity from becoming ambiguous across accounts', async () => {
  const f = fixture();
  const first = await f.core.createChallenge('account-1');
  await f.core.redeemDevelopmentChallenge(first.code, 'discordUser');
  const second = await f.core.createChallenge('account-2');
  await assert.rejects(f.core.redeemDevelopmentChallenge(second.code, 'discordUser'), { code: 'LINK_CONFLICT' });
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
