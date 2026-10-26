import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const nowSeconds = () => Math.floor(Date.now() / 1000);
export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const safeEqual = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
};
export const json = (response, status, body, requestId) => {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-request-id': requestId
  });
  response.end(JSON.stringify(body));
};
export const errorBody = (code, message, requestId) => ({ error: { code, message, requestId } });
export async function readJson(request, maxBytes = 32_768) {
  const raw = await readBody(request, maxBytes);
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw Object.assign(new Error('invalid JSON'), { status: 400, code: 'INVALID_JSON' }); }
}
export async function readForm(request, maxBytes = 4096) {
  return new URLSearchParams(await readBody(request, maxBytes));
}
async function readBody(request, maxBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('request body too large'), { status: 413, code: 'BODY_TOO_LARGE' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
