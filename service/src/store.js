export class MemoryStore {
  constructor() {
    this.challenges = new Map();
    this.tickets = new Map();
    this.sessions = new Map();
    this.accountSessions = new Map();
    this.links = new Map();
    this.oauthStates = new Map();
  }
  revokeAccount(accountId, at) {
    for (const id of this.accountSessions.get(accountId) ?? []) {
      const session = this.sessions.get(id);
      if (session) session.revokedAt = at;
    }
    this.accountSessions.delete(accountId);
    for (const challenge of this.challenges.values()) {
      if (challenge.accountId === accountId && challenge.status === 'pending') challenge.status = 'cancelled';
    }
    for (const ticket of this.tickets.values()) {
      if (ticket.accountId === accountId && !ticket.consumedAt) ticket.revokedAt = at;
    }
    this.links.delete(accountId);
  }
}
