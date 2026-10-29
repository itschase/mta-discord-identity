# HTTP API contract

Base path: `/v1`. JSON is UTF-8. All responses set `Cache-Control: no-store` and `X-Request-Id`.

Except for health, browser OAuth, and the explicitly development-only redeem route, callers send `Authorization: Bearer <installation-secret>`. Secrets must be transported over HTTPS and never in URLs.

Errors use:

```json
{"error":{"code":"INVALID_TICKET","message":"ticket is invalid, expired, or already consumed","requestId":"..."}}
```

Stable codes include `INSTALLATION_UNAUTHORIZED`, `INVALID_ACCOUNT_ID`, `INVALID_CHALLENGE`, `GUILD_POLICY_DENIED`, `INVALID_TICKET`, `SESSION_INVALID`, `IDENTITY_AUTHORIZATION_REVOKED`, `RATE_LIMITED`, `NOT_FOUND`, and `INTERNAL_ERROR`.

## Endpoints

### `POST /v1/link-challenges`

Request: `{"accountId":"local-stable-id"}`

Response 201: `challengeId`, one-time display `code`, `expiresAt` Unix seconds, and `verificationUrl`.

Use `Idempotency-Key` in M1. In the current process-local release, retries can create multiple challenges; all remain account-bound and expire.

### `POST /v1/login-challenges`

Creates a pre-authentication challenge for an already-linked Discord identity. Request: `{"connectionGeneration":7}`. The authenticated installation, positive connection generation, random challenge, and server-only connection token are stored together. No account ID or Discord ID is accepted.

Response 201: `challengeId`, one-time display `code`, `expiresAt`, `verificationUrl`, and `connectionToken`. The MTA adapter must keep `connectionToken` server-side and must not emit it to host clients or browser code. The browser-facing `GET /login` and `POST /login` form starts the Discord OAuth flow.

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

### `POST /v1/login-sessions/exchange`

Body: `{"ticket":"opaque","challengeId":"opaque","connectionToken":"server-only","connectionGeneration":7}`. Atomically consumes a short-lived pre-auth login ticket only when every installation, challenge, connection-token, and generation binding matches. Replays and cross-connection exchanges fail.

Response 200: `{"accountId":"local-stable-id","sessionTicket":"server-held-one-use-ticket"}`. This operation returns the previously linked opaque account reference plus a short-lived server-held activation ticket. It does not provision an account, create a capability session, return Discord data, or change role/donor policy. The adapter must never emit `sessionTicket` to a client. The trusted host first loads and validates the account; only after local admission succeeds does it call `activateLoginSession`, which exchanges this ticket through `POST /v1/sessions/exchange` and caches the bounded capability session.

### `POST /v1/sessions/refresh`

Send installation authentication and `X-Session-Token`. Re-evaluates current policy and advances the rolling expiry without exceeding `absoluteExpiresAt`; it does not rotate the token. Any 401 means the adapter must clear grants immediately. `IDENTITY_AUTHORIZATION_REVOKED` specifically confirms that the link was removed or required Discord membership was revoked; `SESSION_INVALID` covers invalid or expired session proof and is not by itself a confirmed identity-revocation signal. Reaching the absolute expiry requires a new link proof and ticket.

### `POST /v1/accounts/unlink`

Body: `{"accountId":"..."}`. Removes the link and revokes all account sessions. This operation is idempotent.

### `POST /v1/oauth/discord/start`

Body: `{"code":"user-entered-link-code"}`. Validates the pending challenge, creates a high-entropy hashed one-use state and PKCE S256 verifier, and returns the Discord authorization URL. The browser-facing `GET /link` and `POST /link` form performs the same operation without putting the link code in a URL.

`POST /v1/oauth/discord/login/start` and the `/login` form perform the equivalent operation for a pre-auth login challenge. OAuth completion succeeds only when the immutable Discord subject has exactly one existing link for this installation. An absent or ambiguous link fails closed; this slice does not register or provision accounts.

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
- Pre-auth login state is process-local in the current release. A service restart safely invalidates the challenge, connection binding, and ticket, but also loses links; production continuity requires M2 durable storage and transactional ticket consumption.
