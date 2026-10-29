# Host adapter interface

The identity resource intentionally knows nothing about a gamemode's database, ranks, factions, properties, inventory, or characters.

## Required integration

Handle the server-only event `mta-discord-identity:resolve-account`. The handler receives `(player, reply)` and must call `reply(accountId)` synchronously, before the event handler returns, because the adapter reads the callback result immediately. `accountId` must be a non-empty string derived from the host's current trusted server-side login session. Never accept it from a client event, command argument, or synchronized element data.

The generic example uses MTA's server account name only to demonstrate the boundary. A host with its own account database should validate that the player is currently authenticated and return that database's stable internal account ID. The handler should also verify that the event source is the identity adapter's resource root, as the example does.

The callback-function event contract has not yet been exercised in a live multi-resource MTA runtime. Treat it as runtime-unverified until the host conformance test confirms synchronous callback delivery across resources.

## Exports and asynchronous results

Use server exports:

Every export requires an MTA server resource caller. Pre-auth begin, exchange, and activation retain the initiating host resource and reject a later call from a different resource, in addition to the player-generation and account bindings.

- `getContractVersion()` returns host contract `2`; hosts should require this export before enabling the v2 login/session lifecycle.
- `beginLogin(player)` starts a distinct asynchronous pre-authentication challenge and does not require the host account resolver.
- `exchangeLoginTicket(player, ticket)` exchanges against the adapter-held challenge, connection token, and generation. The adapter retains the returned activation ticket and emits only the linked opaque account reference; it does not bind the host account automatically.
- `activateLoginSession(player, accountId)` is called only after the host's local admission checks succeed. It requires the exact adapter-held pending account/generation, exchanges the server-held activation ticket, then caches the bounded session and emits the activation event. The account ID is a trusted server-to-server host result, never client input.
- `beginLink(player)` resolves the current host account and starts an asynchronous challenge request.
- `exchangeTicket(player, ticket)` resolves the account again and asynchronously exchanges a one-use ticket. A successful response caches the bounded session for that player and account.
- `hasCapability(player, name)` is callable only by the host resource that established the session. It re-resolves the current server-side account on every call and returns true only when that account still matches an unexpired adapter-local entry containing the named capability.
- `getDonorTier(player)` applies the same host-resource and current-account binding, then returns the independent informational tier or nil.
- `clearPlayerSession(player)` increments the player's request generation and deletes only the adapter-local cached session.

The asynchronous exports return only the immediate `fetchRemote` initiation result. They do not return the completed HTTP result. Host code must observe these server-only events instead:

- `mta-discord-identity:login-challenge(player, result, statusCode)` after challenge creation; `result` deliberately omits the server-only connection token;
- `mta-discord-identity:login-authorized(player, accountId)` after a bound one-use ticket returns exactly one existing opaque account reference;
- `mta-discord-identity:login-failed(player, statusCode)` when challenge creation or exchange fails;
- `mta-discord-identity:login-session-activated(player, accountId)` after post-admission activation stores a bounded capability session;
- `mta-discord-identity:authorization-revoked(player, accountId)` only when refresh receives the service's explicit terminal identity-revocation code;
- `mta-discord-identity:login-session-failed(player, statusCode)` when post-admission activation fails without publishing grants;
- `mta-discord-identity:link-challenge(player, result, statusCode)` after challenge creation completes;
- `mta-discord-identity:grants-changed(player)` after grants are stored or refreshed, and when expiry or a failed refresh follows the event-emitting clear paths;
- `mta-discord-identity:session-failed(player, statusCode)` when ticket exchange does not produce a valid bound session.

These events are emitted with the adapter resource root as `source`. Host handlers should validate that source before consuming their arguments. A superseded request callback is ignored when its player generation no longer matches.

On `login-authorized`, the host must validate and load the returned account through its own trusted server data and run ban/device/status/duplicate-session checks without yet publishing the game session. If those checks pass, it calls `activateLoginSession`; only `login-session-activated` permits the host to commit local login state. Activation failure must discard the pending local admission and fail closed. This slice supports already-linked identities only. It neither registers accounts nor accepts account or Discord identifiers from a client.

## Account lifecycle and cleanup

Call `clearPlayerSession(player)` immediately on host logout and before binding the same player element to a different account. The adapter also calls it on `onPlayerQuit`. If a host's character switch preserves the same authenticated account, the account-level identity session may remain; if the switch also logs out or replaces the account, clear it first.

The heartbeat independently resolves the current account. If it differs from the account stored with the session, the adapter clears local state. Capability and donor queries also re-resolve the account and clear mismatched state immediately. This is still not a replacement for clearing synchronously during logout or account switch.

`clearPlayerSession` is not unlink. It does not call the service, delete the account-to-Discord link, or revoke the remote session. Permanent unlink is the authenticated service operation `POST /v1/accounts/unlink`; the current MTA resource does not expose that operation. A host unlink workflow therefore requires a separate adapter/API operation and should clear local state immediately while remote revocation is completed.

Refresh failure, an invalid response, account mismatch, or local expiry clears cached grants. Service-side guild-member removal also revokes the link and service sessions when a refresh reaches the service. The adapter emits `authorization-revoked` only for the stable `IDENTITY_AUTHORIZATION_REVOKED` response; transport failure, provider outage, ordinary role changes, and generic expiry do not emit it. Until a heartbeat runs or the local expiry is reached, `hasCapability` can still return the previously cached grant. A network/provider outage therefore becomes fail-closed for grants at the next failed refresh or local expiry, while the host decides its separate login/outage policy.

Events are server-only. Do not mirror capabilities, donor tiers, tickets, session tokens, role IDs, or installation secrets into element data or client Lua.

## Authorization composition

A named grant answers only “may this account potentially invoke this class of operation?” The host must still enforce local rules from authoritative state. For example:

```lua
-- Only the designated host integration resource may call the adapter directly.
-- Other resources call that host's server-only authorization facade.
if not exports["mta-discord-identity"]:hasCapability(client, "staff.players.kick") then return end
if not localPolicyAllowsTarget(client, target) then return end
```

This avoids importing legacy rank numbers and prevents Discord availability from becoming a substitute for gameplay authorization.
