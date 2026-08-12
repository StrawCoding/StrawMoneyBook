# Pending Release Notes


- 資產頁摘要：有價證券左、信用卡右並排（不再各自滿寬）；信用卡不出現在資產母分類／群組統計；信用卡頁可直接「新增信用卡」；刷卡消費＝一般記帳（帳戶選信用卡即走刷卡雙腿，無獨立刷卡表單）；記帳選單獨立「信用卡」區；資產帳戶管理不再提供信用帳戶類型。
- (smb302) 交割帳戶改選舉制：證券新增／編輯直接從既有資產帳戶下拉選 `settlement_account_id` 即可；移除「標記為交割帳戶」按鈕／badge 與帳戶詳情／資產帳戶管理的交割開關；`listSettlementAccounts` 不再以 `is_settlement=1` 過濾；`is_settlement` 僅相容保留。補 Node／`playwright:ui-layout`（正式 UI：CustomSelect 選 `is_settlement=0` 帳戶→按儲存，無 mark 步驟、不走 store.create 捷徑）。
- (smb301) 信用卡 P0 closed 交易正式編輯：回歸改為實際呼叫 `updateManualTransaction`（`smb301-credit-card-formal-edit-entry` harness：`findTransactionRecordById`→gate→`updateTransactionById`，sql.js 觀測）；未提供 `postedAt` 不得把 `occurredAt` 誤判為歸期變更；純消費日校正允許且 `statement_id`／`posted_at`／`closing_balance_minor` 不變；明示改 `postedAt` 同入口拒絕。
- (smb301) 信用卡 P0 正式路徑再硬化：退款強制寫入當期 open（`clampPostedAtIntoOpenPeriod`，不依 closed 期 posted_at）；批次分類／欄位對 closed 改硬拒絕（禁 soft-skip）；allocation／額度／sql.js 正式路徑回歸維持。
- (smb301) 信用卡 P0 正式路徑補齊：一般退款寫入當期 open statement posting（不改 closing）；closed 帳單交易禁批次分類／欄位改動；還款 allocation 禁跨卡與超過 remaining；額度警示改用實際卡債（SUM remaining）；sql.js 正式路徑回歸。

## v1.3.113