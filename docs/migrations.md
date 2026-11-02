# Database migration report

This is the first schema of a new, independently named database: `wordquest-official-v1`, version 1.

No historical application or Delivery Test database is opened, copied, migrated, deleted or overwritten. Initial seeding is atomic and identified by a scoped content-version marker. Repeated initialization does not overwrite user evidence or progress.

The automated test suite injects a failing V1→V2 upgrade into an isolated fake IndexedDB database and checks that version 1 content and metadata survive unchanged. There is no catch-and-delete recovery path in production code.

Future migrations must add explicit Dexie versions and transactional upgrade functions, retain failed-run locks, raw answers, exposure history and scope, and fail without clearing the database. Backup/restore is not implemented or accepted in this batch.
