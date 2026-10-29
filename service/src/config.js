import { readFile } from 'node:fs/promises';

export async function loadConfig(path) {
  const config = JSON.parse(await readFile(path, 'utf8'));
  validateConfig(config);
  return config;
}
export function resolveRuntimeSecrets(config, env = process.env) {
  const value = structuredClone(config);
  const installationName = value.installation.secretEnv;
  if (installationName) value.installation.secret = env[installationName] ?? '';
  value.discordSecrets = {
    clientSecret: env[value.discord.clientSecretEnv] ?? '',
    botToken: env[value.discord.botTokenEnv] ?? ''
  };
  return value;
}
export function validateConfig(c) {
  const required = [['listen.host', c.listen?.host], ['listen.port', c.listen?.port], ['publicBaseUrl', c.publicBaseUrl], ['installation.id', c.installation?.id], ['policy.roleCapabilities', c.policy?.roleCapabilities], ['policy.roleDonorTiers', c.policy?.roleDonorTiers], ['discord.clientId', c.discord?.clientId], ['discord.guildId', c.discord?.guildId], ['discord.redirectUri', c.discord?.redirectUri], ['discord.clientSecretEnv', c.discord?.clientSecretEnv], ['discord.botTokenEnv', c.discord?.botTokenEnv]];
  const missing = required.filter(([, value]) => value === undefined || value === null).map(([name]) => name);
  if (missing.length) throw new Error(`missing configuration: ${missing.join(', ')}`);
  if (c.installation.secret && c.installation.secret.length < 24) throw new Error('installation.secret must be at least 24 characters');
  if (c.installation.secretEnv && !/^[A-Z][A-Z0-9_]*$/.test(c.installation.secretEnv)) throw new Error('installation.secretEnv must be an environment variable name');
  for (const name of ['clientSecretEnv', 'botTokenEnv']) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(c.discord[name])) throw new Error(`discord.${name} must be an environment variable name`);
  }
  for (const name of ['clientId', 'guildId']) {
    if (c.discord[name] && !/^\d+$/.test(c.discord[name])) throw new Error(`discord.${name} must be a numeric Discord ID`);
  }
  if (!Number.isInteger(c.discord.requestTimeoutMs) || c.discord.requestTimeoutMs < 100 || c.discord.requestTimeoutMs > 30000) throw new Error('discord.requestTimeoutMs must be an integer from 100 to 30000');
  const redirect = new URL(c.discord.redirectUri);
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash) throw new Error('discord.redirectUri must be an HTTPS URL without credentials or fragment');
  const expectedRedirect = new URL('/v1/oauth/discord/callback', c.publicBaseUrl);
  if (redirect.href !== expectedRedirect.href) throw new Error(`discord.redirectUri must exactly equal ${expectedRedirect.href}`);
  if (c.environment === 'production' && c.developmentProvider?.enabled) throw new Error('developmentProvider cannot be enabled in production');
  for (const name of ['challengeSeconds', 'oauthStateSeconds', 'ticketSeconds', 'sessionSeconds', 'absoluteSessionSeconds']) {
    if (!Number.isInteger(c.lifetimes?.[name]) || c.lifetimes[name] <= 0) throw new Error(`lifetimes.${name} must be a positive integer`);
  }
  if (c.lifetimes.absoluteSessionSeconds < c.lifetimes.sessionSeconds) throw new Error('lifetimes.absoluteSessionSeconds must be at least sessionSeconds');
  for (const name of ['windowSeconds', 'challengeCreatesPerWindow', 'loginChallengeCreatesPerWindow', 'ticketExchangesPerWindow']) {
    if (!Number.isInteger(c.rateLimits?.[name]) || c.rateLimits[name] <= 0) throw new Error(`rateLimits.${name} must be a positive integer`);
  }
  for (const [role, caps] of Object.entries(c.policy.roleCapabilities)) {
    if (role && !/^\d+$/.test(role)) throw new Error(`role ID must be numeric: ${role}`);
    if (!Array.isArray(caps) || caps.some((x) => !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(x))) throw new Error(`invalid capability list for role ${role}`);
  }
  return true;
}
