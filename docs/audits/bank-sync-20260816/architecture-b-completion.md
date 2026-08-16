# Bank Sync Architecture B — Completion Report

**Date:** 2026-08-16  
**Based on:** Optimization Plan v1.1 / Spec Patch v1.1.1  
**Phase 0 baseline:** `f03ca48` (v1.3.139 dual-key + lookback)

## Delivered

| Phase | Status | Notes |
|-------|--------|-------|
| 0A–0C | DONE (prior) | Dual-key `lastSyncAt` > `last_sync_at`; mandatory lookback; JVM contract tests |
| 1 Behavior Freeze | DONE | Existing FB contracts retained; shared tests green |
| 2 Hua Nan H0 Probe | DONE | `docs/audits/bank-sync-20260816/hua-nan-h0-probe.md` |
| 3 Provider Contract | DONE | `provider-registry.js` (FB + HN schemas / lookback / identityScheme / retry caps) |
| 4 Registry + Generic Plugin | DONE | `connectBank` / `syncBank` / `disconnectBank`; Activity `dispatchByProvider` |
| 5 Orchestrator + account checkpoint | DONE | Migration 046; repo columns; JS per-account watermark persist; `PARTIAL_SUCCESS` |
| 6 Shared runtime extract | DONE (incremental) | `BankAutomationSyncContract.java`; FB monolith retained with shared contract helpers |
| 7 Delete dead remote providers | DONE | `_first-bank-provider.js` / `_playwright-provider.js` tombstoned |
| 8 Error / UX generic codes | DONE | shared `hua_nan_*` auth codes; create-page + i18n zh/en; debug hints |
| 9 Hua Nan adapter | DONE (H0+heuristic) | `HuaNanBankAutomation.java` + identity unit test; post-login still evidence-limited |
| 10 Cleanup / docs / APK | IN THIS RELEASE | docs + bump + APK rebuild |

## Contracts honored (v1.1.1)

1. Watermark = `coveredThrough` (query end / Taipei date), not finish wall-clock; lookback overlap mandatory  
2. Identity schemes versioned: `firstbank:portal-ref:v1`, `huanan:portal-ref:v1`  
3. Dual-key precedence `lastSyncAt` > `last_sync_at`  
4. Account-level checkpoints + connection `last_full_success_at` only on full OK  
5. Auth failures still abort whole sync (reconnect UX); non-auth account failures → `partial_success`

## Residual / honest gaps

- **Live device smoke** for First Bank Phase 0C / Hua Nan login still needs real credentials + rebuilt APK install  
- Hua Nan **post-login account/txn DOM** is heuristic from H0 (not fully portal-contract frozen)  
- Full FirstBankAutomation file split into packages deferred (shared contract extracted first)

## Tests

- Node: bank-sync shared / backend-source / android-source / service / ui-source  
- Android JVM: `FirstBankAutomationSyncContractTest`, `HuaNanBankAutomationIdentityTest`
