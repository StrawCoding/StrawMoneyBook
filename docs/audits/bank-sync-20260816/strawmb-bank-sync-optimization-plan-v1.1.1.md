# StrawMB Bank Sync Optimization Plan — Spec Patch v1.1.1

**Type:** Architecture B specification patch only (no product code)  
**Patches:** Optimization Plan **v1.1**  
**Does not replace:** Legacy Architecture A (`d37467086506a0a544a7e5cdd76f1d9ce428d7a8`)  
**Generated:** 2026-08-16  
**Gate after this patch:** Phase **0A → 0B → 0C** only (not full rewrite)

## Purpose

Stakeholder review of v1.1 (~9.1/10) accepted the plan direction but required **three small, critical contracts** before authorizing implementation. This v1.1.1 patch adds only those contracts.

| # | Topic | Status in v1.1 | v1.1.1 addition |
|---|--------|----------------|-----------------|
| 1 | Checkpoint time meaning | account-level OK; watermark undefined | **Watermark Semantics** + mandatory lookback |
| 2 | `providerTransactionId` upgrades | provider-owned OK; stability undefined | **Identity Stability Contract** + scheme/version |
| 3 | Dual-key read when both present | dual-read OK; precedence undefined | **`lastSyncAt` > `last_sync_at`** |

---

## 1. Checkpoint Watermark Semantics

### 1.1 Problem

Writing `checkpoint = syncFinishedAt` (wall-clock end of sync) can skip transactions that posted **during** the query window but after the bank’s result snapshot.

Example:

```text
04:00 query starts / bank builds snapshot
04:03 new txn posts (not in snapshot)
04:05 sync finishes
if checkpoint = 04:05 → next query starts 04:05 → 04:03 txn may be lost forever
```

### 1.2 Required timestamps (conceptual)

Per **account** sync attempt, Orchestrator / Provider must distinguish:

| Field | Meaning |
|-------|---------|
| `syncStartedAt` | Local wall time when this account sync attempt began |
| `queryCoverageEnd` / `coveredThrough` | **Watermark:** the latest bank-visible instant/date this attempt claims to have covered |
| `syncFinishedAt` | Local wall time when attempt ended (success or fail) |

**Checkpoint that advances on success MUST be the watermark, not finish time:**

```text
on account success:
  bank_accounts.last_success_sync_at = coveredThrough   # NOT syncFinishedAt
  bank_accounts.sync_cursor = providerCursorIfAny
```

### 1.3 How to choose `coveredThrough`

For **date-window portals** (First Bank today):

```text
coveredThrough = min(
  queryEndDateInclusive,          # the end date sent to the bank query form
  bankReportedMaxPostedDate?,     # if available from rows
  syncStartedAt.date(Taipei)      # never claim coverage past "today at start"
)
```

Rules:

1. Never set watermark to `syncFinishedAt` alone.  
2. Never claim coverage beyond the **query end** actually requested.  
3. Prefer the **inclusive query end date** used in the portal request as the primary watermark for date-based banks.  
4. If portal returns an explicit “as-of” / statement end, that may refine watermark **downward** only (never upward past query end).

### 1.4 Next query window (mandatory overlap)

```text
queryEnd   = today (provider timezone; First Bank = Taipei)
queryStart = coveredThrough.date - provider.lookbackDays
             (clamp to initialSyncStartDate / account policy)
```

**Overlap is mandatory for date-window providers — not optional.**

| Provider | Default lookback | Notes |
|----------|------------------|-------|
| `first_bank_tw` | **3 days** (align Architecture A `bank_sync_rules.lookback_days` default) | Native path must honor this after Phase 0B+; no longer “optional” |
| `hua_nan_bank_tw` | **TBD in H0 Probe** (≥1 day recommended floor) | Set in Provider Contract after probe |

Rationale: prefer **re-fetch overlap + idempotent `providerTransactionId` dedupe** over aggressive watermark → permanent miss.

### 1.5 Partial success interaction

Unchanged from v1.1:

- Successful account: advance **that account’s** watermark to its `coveredThrough`
- Failed account: watermark unchanged
- Connection `last_full_success_at` updates only when all syncable accounts succeed

### 1.6 Phase mapping

| Phase | Watermark work |
|-------|----------------|
| **0B** | Dual-key fix; when advancing connection-scoped signal still in use, treat value as **coverage/date watermark**, not finish clock if distinguishable; **lookback mandatory** on native First Bank (wire `lookback_days` / dual keys as needed) |
| **0C** | Device proof: second sync uses overlap window; no full initial-range re-pull unless first sync |
| **5** | Persist account-level `last_success_sync_at` = `coveredThrough`; store optional `last_sync_started_at` / `last_sync_finished_at` for diagnostics |

---

## 2. Transaction Identity Stability Contract

### 2.1 Problem

Architecture A First Bank fallback:

```text
fbtxn_ + hash(accountId|postedAt|amountMinor|summary|note)
```

If a future algorithm silently changes inputs (e.g. drop `summary`, add `referenceNo`), the same bank row yields a **new** `providerTransactionId` → UNIQUE does not collide → **duplicate mirror / ledger risk**.

### 2.2 Contract (normative)

```text
Transaction Identity Contract

1. providerTransactionId MUST be deterministic for the same bank raw row
   under the same identity_scheme + identity_version.

2. Identity MUST remain stable across app upgrades for rows already stored.

3. Existing identity algorithms MUST NOT change silently.

4. If the algorithm must change:
   - require an identity migration plan, AND/OR
   - maintain legacy alias compatibility so old ids still match.

5. Bank-native stable IDs ALWAYS take priority over composite/hash fallbacks.
```

### 2.3 Scheme / version (required concept)

Each Provider declares:

```text
identity_scheme   e.g. firstbank:portal-ref | firstbank:fallback-hash | huanan:…
identity_version  e.g. v1
```

Examples:

```text
firstbank:portal-ref:v1
firstbank:fallback-hash:v1
huanan:portal-ref:v1   # after probe
```

Storage options (choose in Phase 3/5; not all required day one):

- Column `identity_scheme` on `bank_transactions` (recommended when feasible), **or**
- Encode scheme in id prefix only if collision-safe and documented (`fbtxn_v1_…`)

UNIQUE key may remain `(ledger_id, bank_account_id, provider_transaction_id)`; scheme/version need not be part of UNIQUE if the id string itself is versioned/prefixed.

### 2.4 Provider responsibility

```text
buildTransactionIdentity(raw) → providerTransactionId

Priority inside provider:
  1) bank-native transactionId / referenceNo / sequenceNo / stable portal key
  2) versioned composite/hash fallback (NO balanceMinor; avoid mutable text-only)
```

Orchestrator never re-hashes.

### 2.5 Change control

Any PR that changes `buildTransactionIdentity` / Java equivalent **must** include:

- bump `identity_version` or new `identity_scheme`
- migration or dual-match (legacy id OR new id → same logical row)
- tests with fixtures proving old ids still resolve

---

## 3. Dual-key Precedence (Phase 0B)

### 3.1 Canonical contract

```text
Canonical key:  lastSyncAt          (camelCase)
Legacy key:     last_sync_at        (snake_case)

Precedence:     lastSyncAt  >  last_sync_at
```

### 3.2 Java read algorithm (normative)

```java
String watermark = normalizeText(payload.optString("lastSyncAt"));
if (watermark.isEmpty()) {
    watermark = normalizeText(payload.optString("last_sync_at"));
}
// use watermark; never prefer snake when camel is non-empty
```

Equivalently: **if `lastSyncAt` present and non-empty → use it; else fallback to `last_sync_at`.**

### 3.3 JS write during transition

```text
lastSyncAt   = X
last_sync_at = X   // same value; dual-write until aliases removed
```

After transition period: snake may be dropped in a later cleanup phase (document in Phase 10).

### 3.4 Required regression test (Phase 0A/0B)

```text
GIVEN payload:
  lastSyncAt   = "2026-08-16T04:00:00+08:00"   // or date form used by native parser
  last_sync_at = "2026-01-01T00:00:00+08:00"

EXPECT native resolveSyncStartDate / watermark input uses 2026-08-16
       (NOT 2026-01-01)
```

Also keep the characterizing test that today’s HEAD (`d37467086506a0a544a7e5cdd76f1d9ce428d7a8`) sending only `last_sync_at` fails to feed camel-only reader — then 0B makes both paths work with precedence above.

### 3.5 Account-level future

When checkpoints move to `bank_accounts.last_success_sync_at`, the **same precedence rules** apply to any transitional dual-keyed payload fields bridging JS↔Java.

---

## 4. Amendments to v1.1 sections (pointer index)

| v1.1 section | Amendment |
|--------------|-----------|
| §14 Incremental + Checkpoint | Watermark = `coveredThrough`; lookback **mandatory** for date-window providers |
| §13 Idempotency | Add Identity Stability Contract + scheme/version |
| §26 Phase 0B | Dual-key + **precedence** + mandatory First Bank lookback wiring |
| §39 P0 tasks | 0A includes precedence conflict test; 0B implements §3 algorithm |

---

## 5. Implementation gate (unchanged severity, clearer)

**Accepted after v1.1.1:** authorize implementation of:

```text
Phase 0A  Regression / characterizing + precedence conflict test
   ↓
Phase 0B  Dual-key fix + precedence + mandatory lookback on native FB
   ↓
Phase 0C  First Bank device incremental + overlap verification
```

**Not authorized yet:** Phase 1+ (Behavior Freeze onward) until 0A–0C evidence passes.

Architecture B items remain **NOT IMPLEMENTED** in product tree at `d37467086506a0a544a7e5cdd76f1d9ce428d7a8`.

---

## 6. Executive one-liner

v1.1.1 does not redesign Architecture B; it freezes three contracts so Phase 0 cannot reintroduce silent watermark, identity, or dual-key ambiguity.

---

*End of Spec Patch v1.1.1*
