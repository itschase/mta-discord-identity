# Host adapter interface

The identity resource intentionally knows nothing about a gamemode's database, ranks, factions, properties, inventory, or characters.

## Required integration

Handle the server-only event `mta-discord-identity:resolve-account`. The handler receives `(player, reply)` and calls `reply(accountId)` with a stable string identifier obtained from trusted server login state. Never accept this value from a client event or synchronized element data.

## Consuming grants

Use server exports:

- `beginLink(player)` starts a challenge and emits `mta-discord-identity:link-challenge`.
- `exchangeTicket(player, ticket)` consumes a ticket and caches a bounded session.
- `hasCapability(player, name)` returns false when missing, expired, revoked, or unavailable.
- `getDonorTier(player)` returns an independent informational tier or nil.
- `clearPlayerSession(player)` invalidates cached state on logout/account switch.

Events are server-only. Do not mirror capabilities, donor tiers, tickets, session tokens, role IDs, or installation secrets into element data or client Lua.

## Authorization composition

A named grant answers only “may this account potentially invoke this class of operation?” The host must still enforce local rules from authoritative state. For example:

```lua
if not exports["mta-discord-identity"]:hasCapability(client, "staff.players.kick") then return end
if not localPolicyAllowsTarget(client, target) then return end
```

This avoids importing legacy rank numbers and prevents Discord availability from becoming a substitute for gameplay authorization.
