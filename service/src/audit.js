import { mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sha256 } from './util.js';

export class AuditLog {
  constructor(path, { write = true } = {}) {
    this.path = path;
    this.write = write;
    this.previousHash = '0'.repeat(64);
    this.records = [];
  }
  async append(event, fields = {}) {
    const record = { sequence: this.records.length + 1, occurredAt: new Date().toISOString(), event, ...fields, previousHash: this.previousHash };
    record.hash = sha256(JSON.stringify(record));
    this.previousHash = record.hash;
    this.records.push(Object.freeze(record));
    if (this.write) {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
    }
    return record;
  }
}
