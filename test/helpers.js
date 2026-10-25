import { AuditLog } from '../service/src/audit.js';
import { IdentityCore } from '../service/src/core.js';
import { MemoryStore } from '../service/src/store.js';

export function fixture(overrides = {}) {
  let now = 1_790_000_000;
  const config = {
    listen: { host: '127.0.0.1', port: 0 },
    publicBaseUrl: 'https://identity.test',
    installation: { id: 'test', secret: 'a'.repeat(32), allowedCapabilities: ['staff.reports.view', 'community.queue.priority'] },
    discord: { clientId: '', clientSecret: '', guildId: '', redirectUri: '' },
    policy: {
      roleCapabilities: { '100': ['staff.reports.view', 'staff.not-allowed'], '200': ['community.queue.priority'] },
      roleDonorTiers: { '300': 'supporter' }
    },
    lifetimes: { challengeSeconds: 600, ticketSeconds: 60, sessionSeconds: 600, absoluteSessionSeconds: 3600 },
    rateLimits: { windowSeconds: 60, challengeCreatesPerWindow: 5, ticketExchangesPerWindow: 10 },
    audit: { path: 'unused' },
    developmentProvider: { enabled: true, subjectRoles: { discordUser: ['100', '300'] } },
    ...overrides
  };
  const store = new MemoryStore();
  const audit = new AuditLog('unused', { write: false });
  const core = new IdentityCore(config, store, audit, () => now);
  return { config, store, audit, core, advance: (seconds) => { now += seconds; }, now: () => now };
}

export async function linkedSession(f, accountId = 'account-1') {
  const challenge = await f.core.createChallenge(accountId);
  const redeemed = await f.core.redeemDevelopmentChallenge(challenge.code, 'discordUser');
  return f.core.exchangeTicket(redeemed.ticket, accountId);
}
