# Hua Nan H1/H2 evidence template

**禁止提交未遮罩個資。** 身分證、代號、密碼、cookie、完整帳號、完整交易摘要／金額明細不得進 git 或 Plane／聊天紀錄。帳號只留末四碼；URL 只留 path + `trx` / `state` / `target` / `Recognition`。

來源：Android debug trace steps `h1_probe` / `h2_probe`（Phase A observe-only）。沒有下列欄位不得把啟發式寫成已凍合約。Phase 9 在填滿前維持 PARTIAL。

Device / APK `versionName`：
Date：

## H1 account list

| Gate | Trace field | Value (redacted) | Pass? |
|------|-------------|------------------|-------|
| Landing URL path + trx/state/target | `frames[].path` | | |
| Readable vs opaque frames | `readableFrameCount` / `opaqueFrameCount` | | |
| Structural account source (form/trx/table/hidden) | `forms` / `inputs` / `tableIds` | | |
| How account id is identified (field name, not any 8–16 digits) | note + `digitBlobCount` | | |
| Currency / multi-account → `providerAccountId` | note | | |

## H2 transaction query

| Gate | Trace field | Value (redacted) | Pass? |
|------|-------------|------------------|-------|
| Stable inquiry entry (`InqMain`/`明細`, not 交易明細 text-only) | `inquiryMatch`=`inq_main_href`\|`mingxi_text`\|`inq_acct_parent` / `hrefPattern` | | |
| Date form: `#acct1`, `inqtype`, `S_`/`E_` year(ROC)/month/day, `doSubmit` | `dateFields` / `queryButtonFound` / `hasH2FormAnchors` | | |
| Result table header/id **or** JSON method+path | `tableHeaders` / intercept `pathSamples` | | |
| Empty-data copy in body vs iframe vs alert | `hasEmptyText` / `emptyInIframe` | | |
| ≥1 real txn field map (date/amount/summary/ref); no balance in identity | manual after success | | |
| GET vs POST counts; POST never replayed | `getCount` / `postCount` / `skipReason` | | |
| OTP / SSL / BHO required for inquiry? | note (NOT VERIFIED until seen) | | |

`inquiryMatch`: `inq_main_href` | `mingxi_text` | `inq_acct_parent` | `already_on_form` | `none`（legacy `account_row`/`any_text` retired）.  
`reason` on failure: `inquiry_not_found` | `page_not_ready` | `query_timeout` | `missing_h2_anchors`.

Frozen form notes (2026-09-01): ROC year option value = `String.format("%04d", year - 1911)` (2026→`0115`); submit via `doSubmit()`; custom range ≤3 months (`MAX_INQUIRY_MONTHS`).
