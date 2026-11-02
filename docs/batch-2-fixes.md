# Batch 2 targeted defect fixes — 2026-11-02

Local review only, version `0.2.0-batch.2`. HEAD remains
`cd1e035365e79a04f4444989cd9e2b33010519b5`. No new commit, remote synchronization
or deployment. No Delivery Test, historical project, backup or real learner DB
was accessed. No dependencies were added.

## Root causes and remedies

1. Review operations previously checked only each task's revision, allowing a
   different dimension's teaching card to reveal the same spelling while a check
   remained pending. All review transitions now enforce an exclusive episode in
   a database transaction, advance sibling revisions and reject stale requests.
   Teaching is displayed only in a requesting window with a freshly verified
   grant. Visibility/pagehide removes it. An actually displayed stale card reports
   an idempotent exposure event, invalidating affected same-word pending checks.
2. Previous pending checks have no new independence-policy stamp. Startup and
   settlement conservatively invalidate these checks rather than crediting them.
   Invalidations retain an audit and every exposure/error row. Re-teaching must
   use another unseen question. Exhaustion leaves the lock in place.
3. Assisted instances were permanently blocked without a replacement path.
   Presentation now archives the assisted instance and transactionally allocates
   an unseen question for the same scoped target/type. If an unshown reserve is
   used, a different unused reserve fills its place. HP, slot, effective progress
   and required first-eight coverage are unchanged. Exhaustion leaves the battle
   active and shows a clear paused state. Failed writes roll back all changes.
4. Prior process-recovery tests used normal closure. A new test launches its own
   Chromium process groups, asserts ownership, sends real SIGKILL, checks exit
   `-9`, and reopens the same profile without the origin server. Four checkpoints
   cover battle/answer/exposure, defeat/tasks/lock, pending independent spelling,
   and unique victory reward/history. It does not claim Huawei force-stop,
   physical power-loss recovery or interruption inside an in-flight transaction.
5. Previous audio notes cited only the engine license. Official Flite v2.2
   distribution COPYING, slt voice source and voice Makefile were retrieved and
   archived with URLs/hashes. The permissive slt notice is now shipped as well.
   No WAV regeneration occurred. See `audio.md` and `license-evidence/sources.json`.

## Actual test progression

- Before service fixes: three new behavioral regressions failed, reproducing
  cross-task leakage, concurrent teaching acceptance and legacy false passes.
  A fourth control test initially used unsorted UUID-row position; its assertion
  was corrected to read its exact submission ID (not a product defect).
- Targeted database/service additions: 11 tests now pass. Original tests remain
  byte-for-byte unchanged from the pre-fix source audit.
- During offline regression, restored Chromium tabs automatically displayed
  teaching cards and triggered conservative invalidation. Diagnosis captured the
  restored pages and exposure metadata. Teaching display now requires a per-window
  request; refresh retains that window's request. Pending verification callbacks
  are also cancelled on card closure. The unchanged offline test then passed.

| Final actual check | Result |
| --- | --- |
| Unit/content/audio/choice tests | 37 passed |
| Database/service tests (including new 11) | 45 passed |
| Original browser regression | 9 scenarios passed |
| Actual-control UI interaction | 10 scenarios passed |
| Production/offline loop | 5 scenarios passed |
| Targeted defect browser regression | 6 scenarios passed |
| Actual SIGKILL/offline recovery | 4 scenarios passed |
| TypeScript and project-subpath build | Passed |

Browser concurrency tests explicitly combine real UI interactions with
service-level requests from two actual IndexedDB/browser connections; they are
not mislabeled as entirely UI-only tests. The double-visible-teaching-window test
uses actual card buttons and checks durable exposure protection. Source profiles
are newly allocated for each test; no real learner's database is reset.

Final shell ID: `e6b24b919e4c7558fb32`. Current build/source hash records are in
ignored `test-results/fix-build-report.json` and `fix-source-audit.json`.
Evidence: `defect-browser-report.json`, `crash-browser-report.json`,
`fix-independent-retest.png`, `fix-assisted-paused.png`, `fix-sigkill-victory.png`.

## Exact source changes relative to pre-fix batch 2

Modified (15):

- `package.json`
- `README.md`
- `docs/batch-2-review.md`
- `docs/migrations.md`
- `docs/architecture.md`
- `docs/requirements.md`
- `docs/audio.md`
- `src/ui/errors.ts`
- `src/ui/Battle.tsx`
- `src/ui/App.tsx`
- `src/ui/session.ts`
- `src/ui/Review.tsx`
- `src/domain/model.ts`
- `src/services/game.ts`
- `public/audio/LICENSE.txt`

Added (9):

- `docs/batch-2-fixes.md`
- `tests/browser_defect_regression.py`
- `tests/remediation-safety.test.ts`
- `tests/browser_crash_recovery.py`
- `tests/assisted-recovery.test.ts`
- `docs/license-evidence/flite-2.2-slt-Makefile.txt`
- `docs/license-evidence/flite-2.2-slt.c.txt`
- `docs/license-evidence/sources.json`
- `docs/license-evidence/flite-2.2-COPYING.txt`

No source file was removed. The schema, content, SW generation policy, original
test files, two WAVs and all dependencies are unchanged by this fix.

## Risk and acceptance boundary

Conservative invalidation may require another teaching/check and consume a new
question; closing an extra visible teaching window avoids repeated exposure.
If three distinct checks are exhausted, the lock remains and the future parent
replenishment interface is still needed. Assisted replacements also have finite
content and pause rather than inventing an outcome. Optional fields need no index
or Dexie-version migration, but old open application code is not certified to
cooperate with the new policy; multi-version deployment remains separately gated.

Existing caches are retained; long-term cache accumulation and storage retention
still need acceptance. Huawei physical keyboard/speaker/standalone and device
force-stop remain unverified. This is suitable for a user-reviewed local batch-2
commit, not first-stage completion or deployment approval. No automatic commit.
