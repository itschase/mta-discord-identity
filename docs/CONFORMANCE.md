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

Required before production:

- OAuth state/PKCE, redirect allowlist, guild removal, bot token rotation;
- PostgreSQL transactional ticket consumption under concurrency;
- multi-instance rate limit and revocation propagation;
- restart recovery and audit checkpoint verification;
- MTA runtime tests for resource stop, player quit/account switch, callback reordering, timeout, DNS/TLS failure, and service recovery;
- host adapter tests proving client-supplied account IDs cannot enter the resolver;
- load and abuse tests with secret/token redaction assertions.

Passing service tests does not establish that an MTA host integration is safe. Each gamemode must test its own local predicates independently.
