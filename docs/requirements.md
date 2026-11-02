# V2.0 requirement mapping — batch 1

| V2.0 area | Batch 1 implementation | Remaining acceptance work |
| --- | --- | --- |
| Architecture and page routes | React/TypeScript/Vite; Home/Word Bank; hash route plan | Learn, Review, Adventure, Battle and Chinese parent screens |
| Words, objectives, sources, morphology | Separate scoped tables and uniqueness; original seed | Parent import/review/correction; audited morphology relations |
| HP and snapshots | Default 5; strict integers 3–10; boss 8; complete snapshot | Parent PIN/settings interface |
| Required types and preflight | First eight slots; unique reserves; content binding/fingerprint checks | Offline audio, keyboard challenge and accessible question UI |
| Effective submissions | Transactional answer/evidence/HP; idempotency; old-tab rejection | UI integration, assisted-question replacement and recovery UX |
| Loss and retry | Unique dimension tasks; persisted lock; all-pass gate; new full-health run | Teaching/retest UI and content-exhaustion parent workflow |
| Demo isolation | Separate IDs, scopes, evidence, gate, progress and rewards | Real import and full real-learning services in later phases |
| Mastery | Separate skill counts and weak states; never auto-grants Mastered | Cross-day thresholds and spaced review algorithms |
| Persistence and migration | Dexie V1; transaction tests; failed migration rollback test | Full backup/restore and restore-conflict validation |
| Rewards and story | Unique original demo crystal ledger and story-unlock record | Battle stage/animations; short scene rendering |
| PWA and tablet | Relative manifest and configurable Pages base | Build-aware SW, offline audio, install icons, orientation/keyboard/device acceptance |
| Test/production delivery | Local unit/DB/browser validation; build; CI without deployment | User-reviewed GitHub connector sync; separately approved Pages publication |

The Delivery Test's user-reported device results establish the delivery channel only. They do not certify this separate formal project's PWA, database, battle UI or device behavior.

No core requirement has been removed. Unfinished items remain explicit acceptance gates for subsequent batches.
