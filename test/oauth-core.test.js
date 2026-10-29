import assert from 'node:assert/strict';
import test from 'node:test';
import { IdentityCore } from '../service/src/core.js';
import { fixture } from './helpers.js';

test('OAuth state is exact, expiring, and one-use', async () => {
  const f = fixture();
  let roles = ['100', '300'];
  const provider = {
    authorizationUrl: (state, challenge) => `https://discord.test/authorize?state=${state}&code_challenge=${challenge}`,
    completeAuthorization: async () => ({ discordSubject: '789', roleIds: roles }),
    resolveRoles: async () => roles
  };
  f.core = new IdentityCore(f.config, f.store, f.audit, f.now, provider);
  const challenge = await f.core.createChallenge('account-1');
  const started = await f.core.startDiscordOAuth(challenge.code);
  const state = new URL(started.authorizationUrl).searchParams.get('state');
  await assert.rejects(f.core.completeDiscordOAuth(`${state}x`, 'code'), { code: 'OAUTH_STATE_INVALID' });
  const ticket = await f.core.completeDiscordOAuth(state, 'code');
  assert.ok(ticket.ticket);
  await assert.rejects(f.core.completeDiscordOAuth(state, 'code'), { code: 'OAUTH_STATE_INVALID' });

  const next = await f.core.createChallenge('account-2');
  const expiring = await f.core.startDiscordOAuth(next.code);
  const expiringState = new URL(expiring.authorizationUrl).searchParams.get('state');
  f.advance(601);
  await assert.rejects(f.core.completeDiscordOAuth(expiringState, 'code'), { code: 'OAUTH_STATE_INVALID' });
});

test('OAuth denial validates and consumes exact state', async () => {
  const f = fixture();
  const provider = { authorizationUrl: (state) => `https://discord.test/?state=${state}` };
  f.core = new IdentityCore(f.config, f.store, f.audit, f.now, provider);
  const challenge = await f.core.createChallenge('account-1');
  const started = await f.core.startDiscordOAuth(challenge.code);
  const state = new URL(started.authorizationUrl).searchParams.get('state');
  await assert.rejects(f.core.denyDiscordOAuth(`${state}x`), { code: 'OAUTH_STATE_INVALID' });
  await f.core.denyDiscordOAuth(state);
  await assert.rejects(f.core.denyDiscordOAuth(state), { code: 'OAUTH_STATE_INVALID' });
  assert.equal(f.audit.records.at(-1).event, 'oauth.denied');
});

test('current Discord roles are re-evaluated and membership removal revokes session', async () => {
  const f = fixture();
  let roles = ['100'];
  const provider = {
    authorizationUrl: (state) => `https://discord.test/?state=${state}`,
    completeAuthorization: async () => ({ discordSubject: '789', roleIds: roles }),
    resolveRoles: async () => {
      if (roles === null) throw Object.assign(new Error('removed'), { code: 'GUILD_MEMBERSHIP_REVOKED' });
      return roles;
    }
  };
  f.core = new IdentityCore(f.config, f.store, f.audit, f.now, provider);
  const challenge = await f.core.createChallenge('account-1');
  const started = await f.core.startDiscordOAuth(challenge.code);
  const state = new URL(started.authorizationUrl).searchParams.get('state');
  const { ticket } = await f.core.completeDiscordOAuth(state, 'code');
  const session = await f.core.exchangeTicket(ticket, 'account-1');
  assert.deepEqual(session.capabilities, ['staff.reports.view']);
  roles = ['200', '300'];
  const refreshed = await f.core.refreshSession(session.sessionToken);
  assert.deepEqual(refreshed.capabilities, ['community.queue.priority']);
  assert.equal(refreshed.donorTier, 'supporter');
  roles = null;
  await assert.rejects(f.core.refreshSession(session.sessionToken), { code: 'IDENTITY_AUTHORIZATION_REVOKED' });
  assert.equal(f.store.links.has('account-1'), false);
  assert.equal(f.audit.records.at(-1).event, 'membership.revoked');
});
