import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { errorBody, json, readForm, readJson, safeEqual } from './util.js';

const bearer = (request) => request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
export function createIdentityServer(config, core) {
  return createServer(async (request, response) => {
    const requestId = request.headers['x-request-id'] || randomUUID();
    try {
      const url = new URL(request.url, 'http://local');
      if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { status: 'ok', version: 'v1' }, requestId);
      if (request.method === 'GET' && url.pathname === '/link') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'x-request-id': requestId });
        return response.end('<!doctype html><html><head><meta charset="utf-8"><title>Link Discord</title></head><body><main><h1>Link Discord</h1><form method="post" action="/link"><label>One-time code <input name="code" required autocomplete="one-time-code" maxlength="64"></label><button type="submit">Continue with Discord</button></form></main></body></html>');
      }
      if (request.method === 'POST' && url.pathname === '/link') {
        const form = await readForm(request);
        const started = await core.startDiscordOAuth(form.get('code'));
        response.writeHead(303, { location: started.authorizationUrl, 'cache-control': 'no-store', 'x-request-id': requestId });
        return response.end();
      }
      if (request.method === 'POST' && url.pathname === '/v1/oauth/discord/start') {
        const body = await readJson(request); return json(response, 200, await core.startDiscordOAuth(body.code), requestId);
      }
      if (request.method === 'GET' && url.pathname === '/v1/oauth/discord/callback') {
        if (url.searchParams.get('error')) {
          await core.denyDiscordOAuth(url.searchParams.get('state'));
          throw Object.assign(new Error('Discord authorization was denied'), { status: 400, code: 'OAUTH_DENIED' });
        }
        const result = await core.completeDiscordOAuth(url.searchParams.get('state'), url.searchParams.get('code'));
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", 'x-request-id': requestId });
        return response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Discord linked</title></head><body><main><h1>Discord linked</h1><p>Return to the game and enter this one-time ticket:</p><code>${result.ticket}</code></main></body></html>`);
      }
      if (request.method === 'POST' && url.pathname === '/v1/development/redeem') {
        const body = await readJson(request); return json(response, 200, await core.redeemDevelopmentChallenge(body.code, body.discordSubject), requestId);
      }
      if (!safeEqual(bearer(request) ?? '', config.installation.secret)) return json(response, 401, errorBody('INSTALLATION_UNAUTHORIZED', 'valid installation bearer token required', requestId), requestId);
      if (request.method === 'POST' && url.pathname === '/v1/link-challenges') {
        const body = await readJson(request); return json(response, 201, await core.createChallenge(body.accountId), requestId);
      }
      const match = url.pathname.match(/^\/v1\/link-challenges\/([^/]+)$/);
      if (match && request.method === 'GET') return json(response, 200, await core.challengeStatus(match[1], url.searchParams.get('accountId')), requestId);
      if (match && request.method === 'DELETE') { const body = await readJson(request); await core.cancelChallenge(match[1], body.accountId); return json(response, 204, {}, requestId); }
      if (request.method === 'POST' && url.pathname === '/v1/sessions/exchange') {
        const body = await readJson(request); return json(response, 201, await core.exchangeTicket(body.ticket, body.accountId), requestId);
      }
      if (request.method === 'POST' && url.pathname === '/v1/sessions/refresh') return json(response, 200, await core.refreshSession(request.headers['x-session-token']), requestId);
      if (request.method === 'POST' && url.pathname === '/v1/accounts/unlink') { const body = await readJson(request); await core.unlink(body.accountId); return json(response, 204, {}, requestId); }
      return json(response, 404, errorBody('NOT_FOUND', 'not found', requestId), requestId);
    } catch (error) {
      const status = error.status ?? 500, code = error.code ?? 'INTERNAL_ERROR';
      if (status === 500) console.error(requestId, error);
      return json(response, status, errorBody(code, status === 500 ? 'internal error' : error.message, requestId), requestId);
    }
  });
}
