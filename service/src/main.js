import { resolve } from 'node:path';
import { AuditLog } from './audit.js';
import { loadConfig } from './config.js';
import { IdentityCore } from './core.js';
import { createIdentityServer } from './server.js';
import { MemoryStore } from './store.js';

const configPath = resolve(process.env.MDI_CONFIG ?? 'config/service.local.json');
const config = await loadConfig(configPath);
if (!config.installation.secret) throw new Error('installation.secret cannot be blank at runtime');
const core = new IdentityCore(config, new MemoryStore(), new AuditLog(resolve(config.audit.path)));
const server = createIdentityServer(config, core);
server.listen(config.listen.port, config.listen.host, () => console.log(`mta-discord-identity listening on http://${config.listen.host}:${config.listen.port}`));
