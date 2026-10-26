# Threat model

## Assets

- Discord OAuth client secret and bot token
- installation credentials
- account-to-Discord links
- one-use tickets and session tokens
- capability policy and audit evidence

## Adversaries and controls

| Threat | Control in the slice | Production follow-up |
|---|---|---|
| Client supplies another account ID | Only the server host adapter resolves account IDs | Conformance test every host integration |
| Ticket theft/replay | Opaque random ticket, hashed at rest, account-bound, 60-second expiry, one-use flag, current-policy evaluation, unlink revocation | Transactional consume in PostgreSQL |
| Session theft | Opaque random bearer, hashed at rest, bounded expiry, unlink revocation | Key rotation, mTLS/service network, durable revocation |
| Discord role leakage | Policy evaluation stays in service; responses contain names only | Response-schema regression tests |
| Donor implies staff | Separate mapping and output field | Policy review workflow and protected config |
| Stale async callback restores grants | Per-player and per-resource generations | Cancellation handles and chaos tests in MTA |
| Service outage grants authority | Local capability check fails after hard expiry; failed refresh clears cache | Tunable retry budget without stale authorization |
| Brute force/challenge abuse | High-entropy codes, short expiry, fixed-window account limits | Shared IP/account limiter and abuse telemetry |
| Configuration grants unintended power | Installation allowlist intersects role mapping | Signed policy releases and two-person review |
| Audit modification | Hash chain exposes edits/reordering within exported stream | WORM/object-lock export and external checkpoints |
| OAuth login CSRF/code interception | High-entropy hashed one-use state, PKCE S256, exact configured redirect | Validate against a live Discord application deployment |
| Stale Discord roles | Current member lookup at ticket exchange and each heartbeat; absence revokes link/sessions | Optional Guild Members Gateway consumer for lower latency |
| SSRF/redirect downgrade from MTA | Fixed operator-configured base URL, no user URL input | Enforce HTTPS and certificate policy at startup |

## Non-goals

The service does not decide faction membership, duty, target immunity, ownership, proximity, inventory, prices, or punishment policy. A capability is never sufficient by itself for a gameplay mutation.

## Residual risks in v0.1

- Lifecycle state is process-local and disappears on restart.
- Audit output is tamper-evident only within the file and has no external checkpoint.
- Discord OAuth/bot behavior is locally tested with protocol fakes but not yet exercised against real provider credentials.
- The example MTA resource has been statically reviewed but not run inside an MTA server.
