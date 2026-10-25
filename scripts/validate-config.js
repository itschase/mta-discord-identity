import { loadConfig } from '../service/src/config.js';
const path = process.argv[2];
if (!path) throw new Error('usage: node scripts/validate-config.js <config.json>');
await loadConfig(path);
console.log(`${path}: valid structure (blank example secrets are not runtime-ready)`);
