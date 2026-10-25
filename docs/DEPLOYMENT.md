# Deployment plan

## Development slice

Run on loopback with a generated installation secret of at least 24 characters. Enable the development provider only on an isolated machine and list explicit fake subjects/role IDs.

## Production target

1. Run the service and PostgreSQL on a private network behind a TLS reverse proxy.
2. Store Discord client secret, bot token, installation secrets, audit signing/checkpoint key, and database credentials in an operator secret manager. Do not commit them or place them in MTA XML/Lua/client downloads.
3. Disable `developmentProvider` and reject startup if it is enabled under production mode (M1 hardening).
4. Restrict MTA egress to the identity service origin. Grant the resource only `function.fetchRemote`; never add it to the MTA Admin ACL.
5. Export audit records to immutable/WORM storage and monitor hash-chain continuity, auth failures, revocations, latency, Discord sync age, and rate limits.
6. Back up the database, test restore, document credential rotation, and rehearse service loss. Ordinary local login/gameplay should continue; identity-derived actions fail closed after grant expiry.
7. Roll out to a non-privileged capability first, then staff read-only, then narrowly scoped mutations after host-side policy tests.

No production readiness is claimed for v0.1 because durable storage and real Discord OAuth are not yet implemented.
