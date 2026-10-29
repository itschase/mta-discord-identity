# Conformance test plan

Automated in v0.1:

- configured roles intersect the installation capability allowlist;
- donor tier is distinct from capabilities;
- challenges expire and cannot be redeemed twice;
- tickets are account-bound, one-use, and expiring;
- sessions expire and become invalid after unlink;
- rate limits are enforced;
- audit records form a valid hash chain;
- HTTP installation authentication and error envelopes;
- API output does not contain role IDs.
- PKCE uses S256 and authorization URLs bind exact redirect and state;
- OAuth state rejects altered, expired, and replayed values;
- code exchange uses server-only credentials and current bot-resolved roles;
- current role changes replace grants and guild removal revokes sessions.
- pre-auth login resolves only an existing link and returns only its opaque account reference;
- pre-auth login tickets are one-use and reject a mismatched connection generation without consuming the valid ticket.
- link creation rejects a second account for the same installation-scoped Discord subject, while login independently fails closed on ambiguity.

Required before production:

- live Discord redirect registration, guild removal, and bot token rotation;
- PostgreSQL transactional ticket consumption under concurrency;
- multi-instance rate limit and revocation propagation;
- restart recovery and audit checkpoint verification;
- optional Discord Gateway member-event consumer for lower revocation latency;
- MTA runtime tests for resource stop, player quit/account switch, callback reordering, timeout, DNS/TLS failure, and service recovery;
- host adapter tests proving client-supplied account IDs cannot enter the resolver;
- MTA runtime tests proving the adapter-held connection token is never emitted and reconnect/clear/resource generations reject stale login callbacks;
- load and abuse tests with secret/token redaction assertions.

Passing service tests does not establish that an MTA host integration is safe. Each gamemode must test its own local predicates independently.
