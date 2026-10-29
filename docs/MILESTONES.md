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

- [x] Implement Authorization Code + PKCE and one-use hashed state
- [x] Add Discord bot guild/member role lookup with bounded timeout
- [x] Add exact redirect validation and production-mode config guard
- [x] Avoid provider-token storage; no refresh token is required
- [x] Add heartbeat-bounded role/member revocation and audit event
- [ ] Add idempotency-key storage for mutating API operations
- [x] Add a connection-bound pre-authentication challenge for already-linked identities (source only; M2/M3 remain release blockers)
- [x] Stage capability-session activation behind explicit host acceptance of local admission (source only; M2/M3 remain release blockers)
- [x] Bind grant queries to the establishing host resource and re-resolve the trusted account at every query (source only; M2/M3 remain release blockers)
- [x] Distinguish confirmed identity authorization revocation from role changes, expiry, and transport/provider failure (source only; M2/M3 remain release blockers)
- [x] Bind explicit adapter cleanup to the owning host resource and clear older cache state on new pre-auth login (source only; M2/M3 remain release blockers)

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
