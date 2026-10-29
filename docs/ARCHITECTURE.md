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
2. The adapter synchronously asks the host resolver for the currently authenticated local account ID, then asynchronously creates a short-lived challenge.
3. The user authenticates with Discord. The service verifies OAuth state, guild membership, and role policy server-side.
4. The service redeems the challenge once and returns a short-lived, one-use ticket through the user-facing flow.
5. The adapter resolves the current account again, asynchronously exchanges the ticket, and accepts the session only when the returned account ID matches.
6. The service issues a rolling session containing only named capabilities and a separate donor tier. Heartbeats may advance its short expiry but never beyond the configured absolute expiry.
7. Heartbeats refresh policy. Account mismatch, local expiry, or failed authenticated refresh clears local grants. The host must clear immediately on logout/account switch; player quit is cleared by the adapter.

The adapter exports start asynchronous work; completed challenge and session outcomes are delivered through server-only events rather than export return values. Per-player request generations reject callbacks superseded by a later link, exchange, or clear operation.

## Pre-authentication login lifecycle

This is separate from authenticated account linking:

1. The generic adapter starts a login attempt for an unauthenticated player element and increments its server-held connection generation.
2. The service creates an installation-bound challenge and a random connection token. The adapter retains the token and emits only the display code, verification URL, challenge ID, and expiry.
3. Discord OAuth verifies the immutable subject and current guild membership. Link creation prevents the same subject from being attached to multiple accounts in one installation, and login still requires exactly one existing installation-scoped account link. The service never accepts or provisions an account or Discord ID from the MTA client.
4. The browser displays a short-lived one-use login ticket. The adapter exchanges it with the challenge ID, hidden connection token, and unchanged connection generation.
5. The service atomically consumes the ticket and returns the linked opaque account reference plus a server-held one-use activation ticket. The adapter emits only the account reference.
6. The host performs its own account, ban, device, duplicate-session, and game-state checks without committing local login state. If accepted, it asks the adapter to exchange the matching activation ticket and waits for session activation before committing the local session.

The adapter emits the account reference through a server-only event and does not cache capabilities or donor state from the identity exchange itself. It stores the activation ticket only in server memory and exchanges it after explicit host acceptance; a matching bounded session is then cached and announced through a separate server-only event. Existing authenticated link/session operations and role policy remain unchanged. Clearing, player quit, a newer attempt, or resource restart invalidates the adapter generation and pending login state.

Local session clearing and service revocation are distinct. `clearPlayerSession` removes the MTA adapter's cached bearer and grants only. Service-side unlink removes the account link and revokes its sessions through authenticated `POST /v1/accounts/unlink`; that operation is not currently exported by the MTA resource.

The production provider implements step 3 using Discord Authorization Code + PKCE with `identify`, exact configured redirect URI, hashed one-use state, server-side token exchange, and a bot-authenticated current-member lookup. The OAuth access token is used only to resolve the Discord subject and is not stored. A disabled-by-default development provider remains available only for deterministic conformance tests and isolated demonstrations.

Current-role lookup runs again at ticket exchange and every authenticated session refresh. Member removal revokes the account link and all sessions; role changes replace cached grants. Therefore revocation latency is bounded by the MTA heartbeat interval while Discord is reachable. A Gateway listener is not included in this release.

The host resolver callback and emitted-event behavior are source-defined but have not been validated in a live cross-resource MTA runtime. Production integration requires runtime coverage for logout, account replacement, character switching, player quit, callback supersession, timeout, and adapter/service restart.

## Deployment components

The current slice is one Node process and in-memory lifecycle state. Restart therefore invalidates all pre-auth challenges and tickets, which is fail-closed, but it also loses the links required to complete a later login. Production milestone M2 separates durable PostgreSQL state, transactional ticket consumption, worker-driven Discord synchronization, external rate limiting, and append-only audit export. This repository does not claim those components are implemented yet.

## Conceptual OwlMTA lineage

The independent design reflects the intent behind OwlMTA planning Issues #2 (optional OAuth/login), #3 (capability migration), #68 (versioned external API), #96 (operational/observability boundary), and #238 (future integration surface). These references provide motivation only: this project imports no Owl schemas, resources, rank numbers, or policy.
