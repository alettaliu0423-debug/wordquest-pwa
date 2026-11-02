# V2.0 requirement mapping — batch 2

| V2.0 area | Current implementation | Remaining acceptance work |
| --- | --- | --- |
| Architecture and routes | React/TypeScript/Vite; Home, Word Bank, Battle, mandatory Review | Daily Learn, Adventure map and Chinese parent screens |
| Words, objectives, sources, morphology | Separate scoped tables; original demo seed | Parent import/review/correction; audited morphology |
| HP and snapshots | Default 5; strict integers 3–10; boss 8; full snapshot; saved-health UI | Parent PIN and HP-entry interface |
| Required types and preflight | 24 battle questions; first-eight coverage; reserves; 18 retests; content binding/fingerprints; actual offline audio preflight | Target-device audio quality and keyboard acceptance |
| Effective submissions | Transactional answer/evidence/HP; stable IDs; stale-tab rejection; full-keyboard UI; persist-before-animation; archived assisted-instance replacement and safe exhaustion | Assistance controls are intentionally not exposed in this batch |
| Loss and retry | Immediate defeat; dimension tasks; persisted lock; teaching, closed-card fresh checks; all-pass full-health retry; exhaustion messaging | Parent content-replenishment interface |
| Demo isolation | Separate scoped objectives, answers, evidence, progress, gate and rewards | Real import/learning services in later phases |
| Mastery | Separate skill evidence/weak states; no auto-Mastered reward | Cross-day thresholds and spaced review algorithms |
| Persistence and migration | Dexie V1; rollback; browser/tab/process recovery; pending review recovery | Full backup/restore and restore-conflict validation |
| Rewards and story | Battle stage, two fighters, attacks/hits, win/loss, unique demo crystal and story-unlock row | 20–40 second illustrated story scenes |
| PWA and tablet | Relative manifest; base-aware build; generated SW; bundled/cached WAVs; production cold offline battle/review/retry; portrait and reduced-height layout checks | Huawei real-device keyboard/speaker/standalone and long-term storage acceptance |
| Test/production delivery | Original tests retained; real UI and production-offline tests; build-only CI | User-reviewed source synchronization; separately approved publication |

No core requirement has been removed. The broader first-stage acceptance remains incomplete until the remaining required items are implemented and verified. Delivery Test remains untouched and its acceptance is not substituted for formal-project acceptance.
