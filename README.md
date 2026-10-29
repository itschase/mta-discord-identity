# MTA Discord Identity

A self-hosted identity and authorization bridge between Discord and any Multi Theft Auto gamemode.

The project keeps three boundaries explicit:

1. **Identity service** — owns Discord OAuth, guild policy, link challenges, one-use tickets, bounded sessions, revocation, rate limits, and append-only audit records.
2. **MTA adapter resource** — talks to the service asynchronously and exposes stable, provider-neutral grants to server-side Lua.
3. **Host adapter** — the small interface a gamemode implements to map a trusted MTA player session to its own internal account ID and capability decisions.

Discord roles and credentials never enter client Lua. Donor tiers are descriptive benefits, not staff authority. A gamemode remains responsible for target, faction, duty, ownership, proximity, payment, and other gameplay checks.

## Status

This repository includes a dependency-free vertical slice:

- an HTTP identity service with environment-injected installation authentication;
- Discord Authorization Code + PKCE, exact one-use state validation, bot-resolved current guild roles, link challenges, one-use ticket exchange, bounded sessions, heartbeat revocation, rate limits, and hash-chained audit output;
- configurable Discord-role-to-capability and donor-tier policy;
- a generic MTA resource using asynchronous `fetchRemote`, request generations, cache expiry, heartbeat refresh, revocation handling, and fail-closed capability checks;
- a distinct pre-authentication challenge for already-linked Discord identities, bound to an adapter-held connection token and generation; its one-use exchange returns the opaque host account reference plus a server-held activation ticket, and capability state is cached only after the host accepts local admission;
- a host-adapter example with no OwlMTA schema dependency;
- contract and conformance tests.

The development redemption endpoint is intentionally disabled unless `developmentProvider.enabled` is true and is rejected in production mode. Durable storage and optional Gateway-driven revocation remain later milestones; see [docs/MILESTONES.md](docs/MILESTONES.md).

The pre-authentication flow is a fail-closed source slice, not a production-durability claim. The process-local store loses links, challenges, and tickets on restart; M2 storage and real MTA conformance are required before deployment.

## Quick start

Requires Node.js 24+; no package install is needed.

```powershell
Copy-Item config/service.example.json config/service.local.json
# Fill only non-secret Discord IDs in service.local.json.
$env:MDI_INSTALLATION_SECRET = '<generate-at-least-24-random-characters>'
$env:MDI_DISCORD_CLIENT_SECRET = '<from-operator-secret-store>'
$env:MDI_DISCORD_BOT_TOKEN = '<from-operator-secret-store>'
$env:MDI_CONFIG = (Resolve-Path config/service.local.json)
node service/src/main.js
```

Run checks:

```powershell
node --test
node scripts/validate-config.js config/service.example.json
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before exposing the service. The Discord protocol references used by the implementation are recorded in [docs/DISCORD_PROTOCOL_SOURCES.md](docs/DISCORD_PROTOCOL_SOURCES.md).

## Design guarantees

- Provider credentials and installation secrets are server-only.
- API responses contain named capabilities and donor tier, never raw Discord roles.
- Capability sessions have a hard expiry and are cleared on unlink or revocation.
- Sensitive authorization fails closed when the service grant is absent, stale, or expired.
- Local login and ordinary gameplay need not depend on service availability.
- Account identity is supplied only by the MTA host adapter from trusted server state.

## License

Apache-2.0. See [LICENSE](LICENSE).
