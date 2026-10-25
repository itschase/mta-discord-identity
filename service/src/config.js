import { readFile } from 'node:fs/promises';

export async function loadConfig(path) {
  const config = JSON.parse(await readFile(path, 'utf8'));
  validateConfig(config);
  return config;
}
export function validateConfig(c) {
  const required = [['listen.host', c.listen?.host], ['listen.port', c.listen?.port], ['publicBaseUrl', c.publicBaseUrl], ['installation.id', c.installation?.id], ['installation.secret', c.installation?.secret], ['policy.roleCapabilities', c.policy?.roleCapabilities], ['policy.roleDonorTiers', c.policy?.roleDonorTiers]];
  const missing = required.filter(([, value]) => value === undefined || value === null).map(([name]) => name);
  if (missing.length) throw new Error(`missing configuration: ${missing.join(', ')}`);
  if (c.installation.secret && c.installation.secret.length < 24) throw new Error('installation.secret must be at least 24 characters');
  for (const name of ['challengeSeconds', 'ticketSeconds', 'sessionSeconds', 'absoluteSessionSeconds']) {
    if (!Number.isInteger(c.lifetimes?.[name]) || c.lifetimes[name] <= 0) throw new Error(`lifetimes.${name} must be a positive integer`);
  }
  if (c.lifetimes.absoluteSessionSeconds < c.lifetimes.sessionSeconds) throw new Error('lifetimes.absoluteSessionSeconds must be at least sessionSeconds');
  for (const [role, caps] of Object.entries(c.policy.roleCapabilities)) {
    if (role && !/^\d+$/.test(role)) throw new Error(`role ID must be numeric: ${role}`);
    if (!Array.isArray(caps) || caps.some((x) => !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(x))) throw new Error(`invalid capability list for role ${role}`);
  }
  return true;
}
