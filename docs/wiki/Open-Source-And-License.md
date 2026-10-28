# Open-Source-And-License

> 完整版（表格、FAQ、mermaid、建置步驟）：[Wiki · Open Source & License](https://strawcoding.github.io/StrawMoneyBookWiki/operations/open-source-and-license)  
> 文件中心索引：[Wiki /guide/](https://strawcoding.github.io/StrawMoneyBookWiki/guide/)

## 概述

公開 repo：[StrawCoding/StrawMoneyBook](https://github.com/StrawCoding/StrawMoneyBook)。授權：**PolyForm Noncommercial 1.0.0**（[`LICENSE`](../../LICENSE)）。可非商用研究／修改／再散布；**禁止第三方商用**。官方 Play／`api.strawmb.com` 由 StrawCoding 營運，不授予 fork 商用權。

## 允許 vs 禁止（摘要）

| 允許 | 禁止 |
|------|------|
| 個人／非營利組織研究與自用建置 | 付費上架、SaaS、代客記帳收費 |
| Fork 附 LICENSE 再散布 | 移除版權或冒充官方 |
| 向 main 提 PR | 未授權白標／OEM 商業發佈 |

## 本地建置

1. `git clone` 公開 repo  
2. `frontend/.env.example` → `frontend/.env.development.local`，自填 `VITE_GOOGLE_WEB_CLIENT_ID`  
3. `npm install` + `npm run dev:frontend`（詳 [Local-Dev-Quickstart](Local-Dev-Quickstart)、[Environment-Variables](Environment-Variables)）  
4. 勿提交 keystore、Play SA、OAuth secret  

## 商用

需 **StrawCoding 書面授權**；見 Wiki 全文「商用授權」章節。

## 維護者

發版仍依 [Release-Process](Release-Process)、[Closeout-And-Versioning](Closeout-And-Versioning)。產品能力：[`StrawMoneyBook_App_Features_Detailed.md`](../../StrawMoneyBook_App_Features_Detailed.md)。
