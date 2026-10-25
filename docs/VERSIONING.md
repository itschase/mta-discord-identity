# Versioning and migrations

- HTTP paths carry a major version (`/v1`). Breaking field meaning, authentication, or lifecycle changes require `/v2`.
- Additive optional fields and new error codes may ship in a minor release. Callers must ignore unknown response fields.
- Named capabilities are product API. Rename by adding the replacement, supporting both for one deprecation window, then removing the old name in a major policy release.
- Donor tier labels are installation policy, not an ordered authority scale.
- Database migrations introduced in M2 will be forward-only, transactional where supported, numbered, and recorded in a schema-migrations table. Every release notes its minimum schema version and rollback boundary.
- MTA exports/events follow semantic versioning. Removal or changed arguments require a new major resource version; additions are minor.
- During rolling upgrades, the service supports the immediately previous adapter minor version. Sessions never outlive their original hard expiry merely to ease migration.
