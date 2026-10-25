# Milestones and implementation issues

## M0 — Contract and vertical slice (included)

- [x] Three-boundary architecture and threat model
- [x] Versioned API/error contract
- [x] Challenge → development verification → one-use ticket → bounded session
- [x] Role policy mapped to named capabilities and separate donor tier
- [x] Revocation, rate limits, and hash-chained audit
- [x] Generic asynchronous MTA adapter and host example
- [x] Dependency-free service conformance tests

## M1 — Discord-backed identity ([Issue #1](https://github.com/itschase/mta-discord-identity/issues/1))

- [ ] Implement Authorization Code + PKCE and one-use signed state
- [ ] Add Discord bot guild/member role lookup with bounded retry/backoff
- [ ] Add exact redirect/origin validation and production-mode config guard
- [ ] Add encrypted provider-token storage only if refresh tokens are necessary
- [ ] Add role/member removal revocation worker and observability
- [ ] Add idempotency-key storage for mutating API operations

## M2 — Durable multi-instance service ([Issue #2](https://github.com/itschase/mta-discord-identity/issues/2))

- [ ] PostgreSQL schema and forward-only migrations
- [ ] Transactional ticket consumption and durable session revocation
- [ ] Shared rate limiting and revocation distribution
- [ ] Audit checkpoints to immutable storage
- [ ] Backup/restore and credential-rotation runbooks

## M3 — MTA runtime hardening ([Issue #3](https://github.com/itschase/mta-discord-identity/issues/3))

- [ ] Run conformance harness against a real MTA server
- [ ] Track and abort request handles on player/resource teardown
- [ ] Validate HTTPS/redirect behavior supported by deployed MTA build
- [ ] Add bounded retry scheduling without extending grant expiry
- [ ] Publish host adapter cookbook for common account systems

## M4 — Release ([Issue #4](https://github.com/itschase/mta-discord-identity/issues/4))

- [ ] Security review and abuse/load tests
- [ ] Compatibility matrix and upgrade rehearsal
- [ ] Signed release artifacts and SBOM
- [ ] Pilot with a read-only capability before privileged rollout
