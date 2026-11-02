# Database migration report

This is the first schema of a new, independently named database: `wordquest-official-v1`, version 1.

No historical application or Delivery Test database is opened, copied, migrated, deleted or overwritten. Initial seeding is atomic and identified by a scoped content-version marker. Repeated initialization does not overwrite user evidence or progress.

The automated test suite injects a failing V1→V2 upgrade into an isolated fake IndexedDB database and checks that version 1 content and metadata survive unchanged. There is no catch-and-delete recovery path in production code.

Future migrations must add explicit Dexie versions and transactional upgrade functions, retain failed-run locks, raw answers, exposure history and scope, and fail without clearing the database. Backup/restore is not implemented or accepted in this batch.

## Batch 2

No schema upgrade or content reseed is required. Database name, version, scope IDs and original question fingerprints remain unchanged. Local audio resolves existing logical references without altering word/objective rows. UI recovery reads persisted battle/review state, including previously shown retests; no reset or delete recovery path is introduced.

## Batch 2 targeted fixes

Dexie V1 and every existing store/index are unchanged. New optional record fields
are backward-compatible additions: `BattleRun.retiredQuestions` archives assisted
instances; `RemediationTask.independencePolicy` marks checks created under the new
guard; `invalidatedRetests` records the IDs/fingerprints/reasons of invalidated
pending checks. Scoped metadata records idempotent teaching-exposure events.

On startup, legacy unverified pending checks are conservatively invalidated inside
one transaction. The task returns to required teaching; its old question stays in
the exposure log and is also recorded in its invalidation audit. Re-teaching then
allocates an unused question or keeps the exhaustion lock. No past answer, failed
run, passed task, source content, cache or reward is removed. This startup repair
does not clear or rebuild any database. Tests use new isolated profiles only.
