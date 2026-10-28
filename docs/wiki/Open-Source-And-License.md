# Open-Source-And-License

## 目的

說明 StrawMoneyBook **原始碼如何取得**、**授權邊界**（開源但禁止第三方商用），以及與 **StrawCoding 官方營運**（Play、`api.strawmb.com`）的關係。

## 原始碼

- **GitHub**：[StrawCoding/StrawMoneyBook](https://github.com/StrawCoding/StrawMoneyBook)（公開 repo，`main` 為長期分支）
- **本 Wiki**：[StrawMoneyBookWiki](https://github.com/StrawCoding/StrawMoneyBookWiki)（架構／功能域／Operations runbook）

## 授權：PolyForm Noncommercial 1.0.0

- 授權全文：主 repo 根目錄 [`LICENSE`](../../LICENSE)（同 [PolyForm 官網說明](https://polyformproject.org/licenses/noncommercial/1.0.0/)）
- **允許**：閱讀、研究、個人／非營利組織使用、修改、再散布（須保留 LICENSE 與 `Required Notice`）
- **禁止**：任何 **商業目的** 使用或再散布，包括但不限於：
  - 付費 App、訂閱 SaaS、代客記帳服務
  - 以 StrawMoneyBook 程式碼為核心對外收費
  - 冒充或暗示為 StrawCoding 官方發行
- **官方服務不受限**：StrawCoding 維運的 Google Play 版、內部測試通道、`api.strawmb.com` 等，由 StrawCoding 另行營運，不表示第三方取得商用授權。

## 商用授權

若需 **商業使用**（公司內部產品化、白標、上架收費等），須 **另行取得 StrawCoding 書面授權**；PolyForm NC 預設不提供商用權利。

## 本地建置（社群／研究者）

1. Clone 公開 repo（見上）
2. 複製 [`frontend/.env.example`](../../frontend/.env.example) → `frontend/.env.development.local`
3. 填入 **自己的** `VITE_GOOGLE_WEB_CLIENT_ID` 與 API 位址（詳 [Environment-Variables](Environment-Variables)）
4. **勿** 將 keystore、Play 服務帳戶 JSON、OAuth client secret、銀行同步憑證提交 git

## 與維護者 SOP 的關係

- StrawCoding 內部仍依 [Release-Process](Release-Process)、[Closeout-And-Versioning](Closeout-And-Versioning) 發版；公開原始碼 **不等於** 放寬 secret 或 Play 簽章管理
- 產品能力與限制以 [`StrawMoneyBook_App_Features_Detailed.md`](../../StrawMoneyBook_App_Features_Detailed.md) 為準
