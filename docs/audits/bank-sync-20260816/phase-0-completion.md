# Phase 0A–0C Completion Note

**Date:** 2026-08-16  
**Version:** 1.3.139  
**Spec:** Optimization Plan v1.1 + v1.1.1  
**Scope:** Incremental sync contract only (no Architecture B rewrite)

## Done

| Phase | Result |
|-------|--------|
| **0A** | Node source + service tests for dual-write / Java helpers; JVM `FirstBankAutomationSyncContractTest` |
| **0B** | JS dual-write `lastSyncAt`+`last_sync_at`, `lookbackDays`+`lookback_days`; Java `readLastSyncWatermark` precedence; `resolveQueryStartDate` mandatory lookback |
| **0C** | **PARTIAL** — proven in JVM: watermark 2026-08-16 + lookback 3 → query start 2026-08-13; precedence conflict uses camel. Live First Bank device smoke **NOT VERIFIED** this session (needs rebuilt APK + real credentials) |

## Evidence

- `frontend/src/ui/services/bank-sync.service.js` — dual-write sync payload  
- `FirstBankAutomation.java` — `readLastSyncWatermark`, `readLookbackDays`, `resolveQueryStartDate`  
- Tests: node `bank-sync-android-source` / `bank-sync.service`; Android unit 6/6 SyncContract  

## Gate

Phase 1+ (Behavior Freeze / Hua Nan probe / rewrite) **not started**. Await stakeholder OK after device smoke if required.
