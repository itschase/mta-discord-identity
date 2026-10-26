import { createHash } from 'node:crypto';
import { randomToken } from './util.js';

const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';
const DISCORD_API = 'https://discord.com/api/v10';

const providerError = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createPkce() {
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export class DiscordProvider {
  constructor(config, secrets, fetchImpl = fetch) {
    this.config = config;
    this.secrets = secrets;
    this.fetch = fetchImpl;
  }

  authorizationUrl(state, codeChallenge) {
    const url = new URL(DISCORD_AUTHORIZE);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      scope: 'identify',
      state,
      redirect_uri: this.config.redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    }).toString();
    return url.toString();
  }

  async completeAuthorization(code, codeVerifier) {
    const token = await this.#request(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.secrets.clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
        code_verifier: codeVerifier
      })
    }, 'OAUTH_EXCHANGE_FAILED');
    if (!token.access_token || String(token.token_type).toLowerCase() !== 'bearer') {
      throw providerError(502, 'OAUTH_EXCHANGE_FAILED', 'Discord returned an invalid token response');
    }
    const user = await this.#request(`${DISCORD_API}/users/@me`, {
      headers: { authorization: `Bearer ${token.access_token}` }
    }, 'OAUTH_IDENTITY_FAILED');
    if (!/^\d+$/.test(String(user.id ?? ''))) throw providerError(502, 'OAUTH_IDENTITY_FAILED', 'Discord returned an invalid user identity');
    const roleIds = await this.resolveRoles(String(user.id));
    return { discordSubject: String(user.id), roleIds };
  }

  async resolveRoles(discordSubject) {
    let response;
    try {
      response = await this.fetch(`${DISCORD_API}/guilds/${encodeURIComponent(this.config.guildId)}/members/${encodeURIComponent(discordSubject)}`, {
        headers: { authorization: `Bot ${this.secrets.botToken}` },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs)
      });
    } catch { throw providerError(503, 'PROVIDER_UNAVAILABLE', 'Discord guild lookup failed'); }
    if (response.status === 404) throw providerError(403, 'GUILD_MEMBERSHIP_REVOKED', 'Discord guild membership is absent');
    if (!response.ok) throw providerError(503, 'PROVIDER_UNAVAILABLE', `Discord guild lookup failed (${response.status})`);
    let member;
    try { member = await response.json(); } catch { throw providerError(502, 'PROVIDER_INVALID_RESPONSE', 'Discord returned invalid guild member JSON'); }
    if (!Array.isArray(member.roles) || member.roles.some((role) => !/^\d+$/.test(String(role)))) {
      throw providerError(502, 'PROVIDER_INVALID_RESPONSE', 'Discord returned invalid guild member roles');
    }
    return member.roles.map(String);
  }

  async #request(url, options, failureCode) {
    let response;
    try { response = await this.fetch(url, { ...options, signal: AbortSignal.timeout(this.config.requestTimeoutMs) }); }
    catch { throw providerError(503, 'PROVIDER_UNAVAILABLE', 'Discord request failed'); }
    if (!response.ok) throw providerError(response.status === 429 ? 503 : 502, failureCode, `Discord request failed (${response.status})`);
    try { return await response.json(); }
    catch { throw providerError(502, failureCode, 'Discord returned invalid JSON'); }
  }
}
