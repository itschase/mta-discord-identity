# Deployment plan

## Development slice

Run on loopback with a generated installation secret of at least 24 characters. Set the configured environment variable names for the installation secret, Discord client secret, and bot token. Keep only non-secret client/guild IDs in the local JSON. Enable the development provider only on an isolated non-production machine and list explicit fake subjects/role IDs.

## Production target

1. Run the service and PostgreSQL on a private network behind a TLS reverse proxy.
2. Store Discord client secret, bot token, installation secrets, audit signing/checkpoint key, and database credentials in an operator secret manager. Do not commit them or place them in MTA XML/Lua/client downloads.
3. Set `environment` to `production`; configuration validation rejects an enabled development provider. Register exactly the configured HTTPS callback URI in the Discord Developer Portal.
4. Restrict MTA egress to the identity service origin. Grant the resource only `function.fetchRemote`; never add it to the MTA Admin ACL.
5. Install the bot in the configured guild. The service uses `GET /guilds/{guild.id}/members/{user.id}` with the bot token for targeted role resolution. If a later Gateway listener is enabled, request the privileged Guild Members intent only after confirming it is required and approved.
6. Export audit records to immutable/WORM storage and monitor hash-chain continuity, auth failures, revocations, latency, Discord sync age, and rate limits.
7. Back up the database, test restore, document credential rotation, and rehearse service loss. Ordinary local login/gameplay should continue; identity-derived actions fail closed after grant expiry.
8. Roll out to a non-privileged capability first, then staff read-only, then narrowly scoped mutations after host-side policy tests.

Discord OAuth is implemented and locally conformance-tested, but production readiness is not claimed until a real Discord application/guild deployment and MTA runtime exercise are completed. Lifecycle state is still process-local until M2.
