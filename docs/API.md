# HTTP API contract

Base path: `/v1`. JSON is UTF-8. All responses set `Cache-Control: no-store` and `X-Request-Id`.

Except for health, browser OAuth, and the explicitly development-only redeem route, callers send `Authorization: Bearer <installation-secret>`. Secrets must be transported over HTTPS and never in URLs.

Errors use:

```json
{"error":{"code":"INVALID_TICKET","message":"ticket is invalid, expired, or already consumed","requestId":"..."}}
```

Stable codes include `INSTALLATION_UNAUTHORIZED`, `INVALID_ACCOUNT_ID`, `INVALID_CHALLENGE`, `GUILD_POLICY_DENIED`, `INVALID_TICKET`, `SESSION_INVALID`, `RATE_LIMITED`, `NOT_FOUND`, and `INTERNAL_ERROR`.

## Endpoints

### `POST /v1/link-challenges`

Request: `{"accountId":"local-stable-id"}`

Response 201: `challengeId`, one-time display `code`, `expiresAt` Unix seconds, and `verificationUrl`.

Use `Idempotency-Key` in M1. In v0.1 retries can create multiple challenges; all remain account-bound and expire.

### `GET /v1/link-challenges/{id}?accountId=...`

Returns `pending`, `redeemed`, `cancelled`, or `expired`. Account binding is mandatory.

### `DELETE /v1/link-challenges/{id}`

Body: `{"accountId":"..."}`. Cancels a pending challenge.

### `POST /v1/sessions/exchange`

Body: `{"ticket":"opaque","accountId":"..."}`. Atomically consumes an account-bound ticket.

Response 201:

```json
{
  "sessionId": "opaque-id",
  "sessionToken": "shown-once-bearer",
  "accountId": "local-stable-id",
  "capabilities": ["staff.reports.view"],
  "donorTier": "supporter",
  "issuedAt": 1790000000,
  "expiresAt": 1790000600,
  "absoluteExpiresAt": 1790003600
}
```

Raw Discord guilds, roles, names, and IDs are forbidden in this response.

### `POST /v1/sessions/refresh`

Send installation authentication and `X-Session-Token`. Re-evaluates current policy and advances the rolling expiry without exceeding `absoluteExpiresAt`; it does not rotate the token. A 401 means the adapter must clear grants immediately. Reaching the absolute expiry requires a new link proof and ticket.

### `POST /v1/accounts/unlink`

Body: `{"accountId":"..."}`. Removes the link and revokes all account sessions. This operation is idempotent.

### `POST /v1/oauth/discord/start`

Body: `{"code":"user-entered-link-code"}`. Validates the pending challenge, creates a high-entropy hashed one-use state and PKCE S256 verifier, and returns the Discord authorization URL. The browser-facing `GET /link` and `POST /link` form performs the same operation without putting the link code in a URL.

### `GET /v1/oauth/discord/callback`

The only accepted redirect URI is exactly `{publicBaseUrl}/v1/oauth/discord/callback`. The callback requires both the exact one-use `state` and authorization `code`, exchanges the code server-side with the matching PKCE verifier, resolves `/users/@me`, and fetches the current configured-guild member using the bot token. It displays a short-lived one-use MTA ticket; Discord tokens and roles are never returned.

### `POST /v1/development/redeem`

Available only when the development provider is enabled. It accepts a challenge code and configured fake subject. Never expose it in a production configuration.

## Discord provider behavior

- Authorization Code flow with PKCE S256, exact redirect URI, hashed one-use state bound to challenge, and 10-minute maximum state lifetime.
- Server-side code exchange; validate user identity through Discord and fetch configured guild membership/roles with bot credentials.
- Deny users outside configured guild policy.
- Never pass provider access/refresh tokens to MTA.
- Re-fetch current membership and roles on ticket exchange and each heartbeat refresh. Member absence revokes the link and all sessions. Gateway events are a future latency optimization, not a current runtime claim.
