# Architecture

## Trust boundaries

```text
Discord user/browser       Discord API
        | OAuth                 |
        +----------+------------+
                   v
        Identity service + policy
        | hashed challenges/tickets
        | bounded provider-neutral grants
        | append-only audit
        v
    MTA adapter resource
        | server-only exports/events
        v
       Host adapter ----> gamemode authorization and state
```

The identity service is the only component that knows Discord application credentials, guild IDs, or role IDs. The MTA adapter authenticates as a configured installation and sees only its own account IDs, named capabilities, donor tier, opaque session tokens, and expiry timestamps. The host adapter derives account identity from the gamemode's trusted server-side login state.

## Identity lifecycle

1. The host asks the adapter to begin linking for a player.
2. The adapter resolves the local account ID through the host boundary and creates a short-lived challenge.
3. The user authenticates with Discord. The service verifies OAuth state, guild membership, and role policy server-side.
4. The service redeems the challenge once and returns a short-lived, one-use ticket through the user-facing flow.
5. The adapter exchanges the ticket while binding it to the same local account ID.
6. The service issues a bounded session containing only named capabilities and a separate donor tier.
7. Heartbeats refresh policy. Unlink, account switch, logout, expiry, or failed authenticated refresh clears local grants.

The vertical slice supplies a disabled-by-default development identity provider in place of step 3. It exists only for deterministic conformance tests and local demonstrations.

## Deployment components

The current slice is one Node process and in-memory lifecycle state. Production milestone M2 separates durable PostgreSQL state, worker-driven Discord synchronization, external rate limiting, and append-only audit export. This repository does not claim those components are implemented yet.

## Conceptual OwlMTA lineage

The independent design reflects the intent behind OwlMTA planning Issues #2 (optional OAuth/login), #3 (capability migration), #68 (versioned external API), #96 (operational/observability boundary), and #238 (future integration surface). These references provide motivation only: this project imports no Owl schemas, resources, rank numbers, or policy.
