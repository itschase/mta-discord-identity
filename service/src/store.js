export class MemoryStore {
  constructor() {
    this.challenges = new Map();
    this.tickets = new Map();
    this.sessions = new Map();
    this.accountSessions = new Map();
    this.links = new Map();
  }
  revokeAccount(accountId, at) {
    for (const id of this.accountSessions.get(accountId) ?? []) {
      const session = this.sessions.get(id);
      if (session) session.revokedAt = at;
    }
    this.accountSessions.delete(accountId);
    this.links.delete(accountId);
  }
}
