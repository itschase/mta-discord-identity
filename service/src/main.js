import { resolve } from 'node:path';
import { AuditLog } from './audit.js';
import { loadConfig, resolveRuntimeSecrets } from './config.js';
import { IdentityCore } from './core.js';
import { DiscordProvider } from './discord-provider.js';
import { createIdentityServer } from './server.js';
import { MemoryStore } from './store.js';

const configPath = resolve(process.env.MDI_CONFIG ?? 'config/service.local.json');
const config = resolveRuntimeSecrets(await loadConfig(configPath));
if (!config.installation.secret) throw new Error('installation.secret cannot be blank at runtime');
if (!config.discord.clientId || !config.discord.guildId || !config.discordSecrets.clientSecret || !config.discordSecrets.botToken) throw new Error('Discord IDs and server-only credentials are required at runtime');
const provider = new DiscordProvider(config.discord, config.discordSecrets);
const core = new IdentityCore(config, new MemoryStore(), new AuditLog(resolve(config.audit.path)), undefined, provider);
const server = createIdentityServer(config, core);
server.listen(config.listen.port, config.listen.host, () => console.log(`mta-discord-identity listening on http://${config.listen.host}:${config.listen.port}`));
