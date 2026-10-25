import { evaluatePolicy } from './policy.js';
import { FixedWindowRateLimiter } from './rate-limit.js';
import { nowSeconds, randomToken, sha256 } from './util.js';

const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };

export class IdentityCore {
  constructor(config, store, audit, clock = nowSeconds) {
    this.config = config; this.store = store; this.audit = audit; this.clock = clock;
    this.limiter = new FixedWindowRateLimiter(config.rateLimits.windowSeconds);
  }
  async createChallenge(accountId) {
    if (!accountId || typeof accountId !== 'string' || accountId.length > 128) fail(400, 'INVALID_ACCOUNT_ID', 'accountId must be a non-empty string');
    const now = this.clock();
    const rate = this.limiter.take(`challenge:${accountId}`, this.config.rateLimits.challengeCreatesPerWindow, now);
    if (!rate.allowed) fail(429, 'RATE_LIMITED', `retry after ${rate.retryAfter} seconds`);
    const id = randomToken(16), code = randomToken(9);
    const challenge = { id, accountId, codeHash: sha256(code), createdAt: now, expiresAt: now + this.config.lifetimes.challengeSeconds, status: 'pending' };
    this.store.challenges.set(id, challenge);
    await this.audit.append('challenge.created', { challengeId: id, accountId });
    return { challengeId: id, code, expiresAt: challenge.expiresAt, verificationUrl: `${this.config.publicBaseUrl}/link` };
  }
  async redeemDevelopmentChallenge(code, discordSubject) {
    if (!this.config.developmentProvider.enabled) fail(404, 'NOT_FOUND', 'not found');
    const now = this.clock();
    const challenge = [...this.store.challenges.values()].find((item) => item.status === 'pending' && item.codeHash === sha256(code));
    if (!challenge || challenge.expiresAt <= now) fail(400, 'INVALID_CHALLENGE', 'challenge is invalid or expired');
    const roleIds = this.config.developmentProvider.subjectRoles[discordSubject];
    if (!Array.isArray(roleIds)) fail(403, 'GUILD_POLICY_DENIED', 'subject is not allowed by development provider policy');
    const grants = evaluatePolicy(this.config, roleIds);
    challenge.status = 'redeemed'; challenge.discordSubject = discordSubject;
    this.store.links.set(challenge.accountId, { discordSubject, roleIds, linkedAt: now });
    const ticket = randomToken();
    this.store.tickets.set(sha256(ticket), { accountId: challenge.accountId, grants, expiresAt: now + this.config.lifetimes.ticketSeconds, consumedAt: null });
    await this.audit.append('challenge.redeemed', { challengeId: challenge.id, accountId: challenge.accountId, discordSubject, capabilityCount: grants.capabilities.length, donorTier: grants.donorTier });
    return { ticket, expiresAt: now + this.config.lifetimes.ticketSeconds };
  }
  async challengeStatus(id, accountId) {
    const item = this.store.challenges.get(id);
    if (!item || item.accountId !== accountId) fail(404, 'NOT_FOUND', 'challenge not found');
    const status = item.status === 'pending' && item.expiresAt <= this.clock() ? 'expired' : item.status;
    return { challengeId: id, status, expiresAt: item.expiresAt };
  }
  async cancelChallenge(id, accountId) {
    const item = this.store.challenges.get(id);
    if (!item || item.accountId !== accountId) fail(404, 'NOT_FOUND', 'challenge not found');
    if (item.status === 'pending') item.status = 'cancelled';
    await this.audit.append('challenge.cancelled', { challengeId: id, accountId });
  }
  async exchangeTicket(ticket, accountId) {
    const now = this.clock();
    const rate = this.limiter.take(`exchange:${accountId}`, this.config.rateLimits.ticketExchangesPerWindow, now);
    if (!rate.allowed) fail(429, 'RATE_LIMITED', `retry after ${rate.retryAfter} seconds`);
    const item = this.store.tickets.get(sha256(ticket));
    if (!item || item.accountId !== accountId || item.expiresAt <= now || item.consumedAt) fail(400, 'INVALID_TICKET', 'ticket is invalid, expired, or already consumed');
    item.consumedAt = now;
    const sessionId = randomToken(16), bearer = randomToken();
    const session = { id: sessionId, tokenHash: sha256(bearer), accountId, grants: item.grants, issuedAt: now, expiresAt: now + this.config.lifetimes.sessionSeconds, revokedAt: null };
    this.store.sessions.set(sessionId, session);
    const set = this.store.accountSessions.get(accountId) ?? new Set(); set.add(sessionId); this.store.accountSessions.set(accountId, set);
    await this.audit.append('session.created', { sessionId, accountId, expiresAt: session.expiresAt });
    return this.sessionView(session, bearer);
  }
  authenticateSession(bearer) {
    const hash = sha256(bearer ?? '');
    const session = [...this.store.sessions.values()].find((item) => item.tokenHash === hash);
    if (!session || session.revokedAt || session.expiresAt <= this.clock()) fail(401, 'SESSION_INVALID', 'session is invalid, expired, or revoked');
    return session;
  }
  async refreshSession(bearer) {
    const session = this.authenticateSession(bearer);
    const link = this.store.links.get(session.accountId);
    if (!link) fail(401, 'SESSION_INVALID', 'account link no longer exists');
    session.grants = evaluatePolicy(this.config, link.roleIds);
    return this.sessionView(session);
  }
  async unlink(accountId) {
    const now = this.clock(); this.store.revokeAccount(accountId, now);
    await this.audit.append('account.unlinked', { accountId });
  }
  sessionView(session, bearer) {
    return { sessionId: session.id, ...(bearer ? { sessionToken: bearer } : {}), accountId: session.accountId, capabilities: session.grants.capabilities, donorTier: session.grants.donorTier, issuedAt: session.issuedAt, expiresAt: session.expiresAt };
  }
}
