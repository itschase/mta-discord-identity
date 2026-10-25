# MTA Discord Identity

A self-hosted identity and authorization bridge between Discord and any Multi Theft Auto gamemode.

The project keeps three boundaries explicit:

1. **Identity service** — owns Discord OAuth, guild policy, link challenges, one-use tickets, bounded sessions, revocation, rate limits, and append-only audit records.
2. **MTA adapter resource** — talks to the service asynchronously and exposes stable, provider-neutral grants to server-side Lua.
3. **Host adapter** — the small interface a gamemode implements to map a trusted MTA player session to its own internal account ID and capability decisions.

Discord roles and credentials never enter client Lua. Donor tiers are descriptive benefits, not staff authority. A gamemode remains responsible for target, faction, duty, ownership, proximity, payment, and other gameplay checks.

## Status

This repository includes a dependency-free vertical slice:

- an HTTP identity service with installation authentication;
- link challenge creation, development-provider redemption, one-use ticket exchange, bounded sessions, grant refresh, unlink/revocation, rate limits, and hash-chained audit output;
- configurable Discord-role-to-capability and donor-tier policy;
- a generic MTA resource using asynchronous `fetchRemote`, request generations, cache expiry, heartbeat refresh, revocation handling, and fail-closed capability checks;
- a host-adapter example with no OwlMTA schema dependency;
- contract and conformance tests.

The development redemption endpoint is intentionally disabled unless `developmentProvider.enabled` is true. Real Discord OAuth and a durable database are the next implementation milestone; see [docs/MILESTONES.md](docs/MILESTONES.md).

## Quick start

Requires Node.js 24+; no package install is needed.

```powershell
Copy-Item config/service.example.json config/service.local.json
# Fill installation.secret and developmentProvider.subjectRoles for local testing.
$env:MDI_CONFIG = (Resolve-Path config/service.local.json)
node service/src/main.js
```

Run checks:

```powershell
node --test
node scripts/validate-config.js config/service.example.json
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before exposing the service.

## Design guarantees

- Provider credentials and installation secrets are server-only.
- API responses contain named capabilities and donor tier, never raw Discord roles.
- Capability sessions have a hard expiry and are cleared on unlink or revocation.
- Sensitive authorization fails closed when the service grant is absent, stale, or expired.
- Local login and ordinary gameplay need not depend on service availability.
- Account identity is supplied only by the MTA host adapter from trusted server state.

## License

Apache-2.0. See [LICENSE](LICENSE).
