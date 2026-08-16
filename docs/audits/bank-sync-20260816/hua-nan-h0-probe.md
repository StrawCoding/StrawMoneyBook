# Hua Nan Bank (華南銀行) Personal Netbank — H0 Probe

| Field | Value |
|-------|--------|
| **Provider id (Architecture B)** | `hua_nan_bank_tw` |
| **Probe date** | 2026-08-16 |
| **Scope** | Read-only login-page (H0) probe for StrawMoneyBook bank sync Architecture B |
| **Start URL** | `https://netbank.hncb.com.tw/netbank/servlet/TrxDispatcher?Recognition=private&state=prompt&target=InsAnTr&trx=com.lb.wibc.trx.Login` |
| **Credentials submitted** | **None** |
| **Product code modified** | **None** |
| **Methods** | `curl` HTML/asset fetch + Chromium Playwright (DOM/network/screenshot); no login POST |

Evidence directory: `docs/audits/bank-sync-20260816/evidence/hua-nan-h0/`

---

## Verdict (short)

Personal netbank login is a classic **server-rendered form POST** to `TrxDispatcher` (`state=checkuser`), with:

- Visible fields: **national ID** (`USERIDTEXT`), **nickname/代號** (`NICKNAME`), **password** (`PASSWORD`), **4-digit numeric captcha** (`TrxCaptchaKey`)
- Hidden twin for ID (`USERID`) synced from `USERIDTEXT` (same class of trap as First Bank fake/hidden fields)
- Client-side **RSA/DES password encipher** into `r_cipherpin` / `r_cipherkey` (+ pair2) before submit; nickname RSA-wrapped into `hideNickName`
- **Optional virtual keyboard** (jQuery UI Keyboard; toggle `#littleKeyboard`「開啟小鍵盤」)
- **No SSL-password / OTP / device-bind inputs on the login form** (SSL mentioned only in password-policy text; OTP helper exists in shared JS but unused here)
- **BHO/OCX** is advertised for **transfer / batch** flows, not required to render the login form
- Post-login account list, statement query window, and native transaction keys: **NOT VERIFIED** (login-gated)

---

## 1. Login page HTML structure

### Evidence — HTTP

| Item | Result |
|------|--------|
| URL | `https://netbank.hncb.com.tw/netbank/servlet/TrxDispatcher?Recognition=private&state=prompt&target=InsAnTr&trx=com.lb.wibc.trx.Login` |
| HTTP | **200** (`curl` + Playwright) |
| `Content-Type` | `text/html; charset=UTF-8` |
| Session | `Set-Cookie: JSESSIONID=…; Path=/; Secure; HttpOnly; SameSite=None` |
| Title | `遨遊金融、理財舵手~華南銀行-個人網路銀行` |
| Artifacts | `evidence/hua-nan-h0/login.html`, `headers.txt`, `login.png`, `playwright-dom.json` |

### Form

| Attr | Value |
|------|--------|
| `name` | `LoginForm` |
| `id` | `LoginForm_post` |
| `method` | `post` |
| `action` | `/netbank/servlet/TrxDispatcher` |
| Submit handler | `doSubmit()` → validates → `encipherExd(...)` → clears password → `$("#LoginForm_post").submit()` |
| Posted `trx` / `state` | `com.lb.wibc.trx.Login` / `checkuser` |
| `Recognition` | `private` (personal) |

### Visible credential / captcha fields

| Purpose | `name` | `id` | `type` | Constraints (from DOM + `doSubmit`) |
|---------|--------|------|--------|--------------------------------------|
| National ID (visible) | `USERIDTEXT` | `USERIDTEXT` | `text` | `maxlength=10`, placeholder `請輸入身分證字號`, `oninput=syncHiddenUSERID()` |
| Nickname / 代號 | `NICKNAME` | `NICKNAME` | `text` | `maxlength=10`, placeholder `請輸入您的代號`; validation messages say **6–10** alnum |
| Password | `PASSWORD` | `password` | `password` | `minlength=8` `maxlength=16`, placeholder `請輸入8~16位密碼` |
| Captcha | `TrxCaptchaKey` | `TrxCaptchaKey` | `text` | `maxlength=4`, placeholder `圖形驗證碼`; must be **length 4** and **digits only** (`isAlphaNumber1` digit range) |

### Critical hidden fields (automation contract)

| `name` | Role |
|--------|------|
| `USERID` | **True ID value** submitted; mirrored from `USERIDTEXT` via `syncHiddenUSERID()` |
| `hideNickName` | RSA-encrypted nickname (`encryptNickName` / JSEncrypt); plaintext `NICKNAME` cleared before submit |
| `r`, `r_id`, `r_mac`, `r_cipherpin`, `r_cipherkey` | Password encipher payload (first ≤8 chars) |
| `r_id2`, `r_mac2`, `r_cipherpin2`, `r_cipherkey2` | Second half when password length > 8 |
| `MacPASSWORD`, `isMacPPC` | Mac-related password path placeholders |
| `chkImage` | `Y` (captcha enabled) |
| `PwdChg`, `NKChg` | Password / nickname change flags (`N` on normal login) |
| `cookie_inst` | Filled at submit (`getInstCookies()` —「HKU伏擊驗證」comment dated 20251229) |
| `lang` | `CH` |
| `target` | `InsAnTr` |

**Automation note:** Writing only `#USERIDTEXT` without syncing `#USERID` (or calling `syncHiddenUSERID`) risks empty/stale `USERID` — analogous to First Bank `#loginCustIdFake` vs `#loginCustId`.

### Snippet — visible inputs (from saved HTML)

```html
<input class="text_bar" name="USERIDTEXT" id="USERIDTEXT" value="" type="text"
       maxlength="10" autocomplete="off" placeholder="請輸入身分證字號"
       oninput="syncHiddenUSERID()">
<input type="hidden" name="USERID" id="USERID" value="" maxlength="10">
<input class="text_bar" name="NICKNAME" id="NICKNAME" type="text" maxlength="10"
       autocomplete="off" placeholder="請輸入您的代號">
<input class="input_box_witheye input" name="PASSWORD" id="password" type="password"
       minlength="8" maxlength="16" autocomplete="off" placeholder="請輸入8~16位密碼" …>
<input name="TrxCaptchaKey" type="text" class="text_bar_private" id="TrxCaptchaKey"
       size="5" maxlength="4" value="" placeholder="圖形驗證碼">
<img src="/netbank/pages/jsp/html/CaptchaImage_2.jsp" id="code_Cap" name="code_Cap"
     height="30" width="80">
<span id="littleKeyboard" style="color:blue;">開啟小鍵盤</span>
```

### Virtual keyboard

| Item | Finding |
|------|---------|
| Present | **Yes (optional)** |
| Toggle | `#littleKeyboard` — text「開啟小鍵盤」/「關閉小鍵盤」(Playwright visible) |
| Library | `/netbank/pages/jsp/Login/html/js/jquery.keyboard.js` + `css/keyboard.css` (HTTP 200) |
| Init | Inline `use_hncbVirtualKey` / `hncbVirtualKey`; attaches to USERID / NICKNAME / password / captcha when enabled |
| Layout | Custom shuffled keys from `randomDataObj` |
| Required for login | **No** — default `littleKeyboardFlag = true` means keyboard **not** forced; users can type normally |
| Risk | If automation opens keyboard mode, must drive jQuery Keyboard API or destroy before submit (`doSubmit` destroys keyboards when flag false) |

---

## 2. SSL password / OTP / device bind — login vs later

| Factor | On login page? | Evidence |
|--------|----------------|----------|
| **SSL password input** | **No** | No `input` name/id/placeholder containing SSL. 「SSL密碼」appears only inside **password policy** copy (`pwdExdList` / help rules: password must not equal SSL password). Sidebar link「憑證小秘書」→ external QA page. |
| **OTP / 動態密碼 / 簡訊** | **No field on login** | Zero OTP/簡訊/動態密碼 strings in login HTML body. Shared `jstool.js` defines `isOTPPassword` (8-digit) — indicates OTP exists elsewhere in the portal, **NOT VERIFIED** which post-login trx. |
| **Device bind** | **No** | No 裝置綁定 / 設備綁定 copy on login page (Playwright `flags.device=false`). |
| **BHO / OCX** | **Linked, not a login gate** | Notices link to `BHO.html` / `BHO_MANUAL.pdf` for **單筆轉帳與整批多筆轉帳** component download. Login form renders without ActiveX. |

**Conclusion for Provider capabilities:** H0 login challenge = **ID + 代號 + password + image captcha** (+ client crypto). SSL/OTP/device-bind should be modeled as **post-login / high-risk txn** capabilities until a logged-in probe proves otherwise (**NOT VERIFIED**).

---

## 3. JSON / XHR endpoints visible from login assets

### Observed XHR (Playwright network)

| Method | URL | Status | Notes |
|--------|-----|--------|-------|
| `POST` | `https://netbank.hncb.com.tw/netbank/pages/jsp/Login/html/Login.json` | **200** `application/json;charset=utf-8` | Password help content only (`pwdInfo`); called from `Login.js` `setPwdInfo` |

### Login submit (form POST — not XHR)

| Method | URL | Body model |
|--------|-----|------------|
| `POST` | `https://netbank.hncb.com.tw/netbank/servlet/TrxDispatcher` | Classic multipart/form-urlencoded `LoginForm` fields (`trx`, `state=checkuser`, cipher fields, captcha, …) |

### Other login-page related URLs (static / servlet)

| URL | Role |
|-----|------|
| `/netbank/pages/jsp/html/CaptchaImage_2.jsp` | Captcha PNG |
| `/netbank/pages/jsp/html/encrypt.js` | RSA/DES encipher helpers |
| `/netbank/pages/jsp/html/validateLoginChg.js` | `checkLogin_private` / `encipherExd` |
| `/netbank/pages/jsp/html/jstool.js` | ID/nickname/OTP validators |
| `/netbank/pages/js/jsencrypt.min.v2.3.0.js` | Nickname RSA |
| `/netbank/pages/jsp/Login/html/js/Login.js` | Loads `Login.json` |
| `/netbank/pages/jsp/Time/html/time_edit.jsp` | Linked asset (clock widget) |
| `https://tag.hncb.com.tw/jscollection/…` | Marketing/analytics tags (non-auth) |

**No REST `/api/…` JSON transaction APIs** were discovered on the unauthenticated login surface. Portal appears **TrxDispatcher + JSP**-centric. Post-login XHR/JSON for account/statement: **NOT VERIFIED**.

---

## 4. Captcha image URL pattern

| Item | Value |
|------|--------|
| Element | `<img id="code_Cap" name="code_Cap">` |
| Base URL | `/netbank/pages/jsp/html/CaptchaImage_2.jsp` |
| Absolute | `https://netbank.hncb.com.tw/netbank/pages/jsp/html/CaptchaImage_2.jsp` |
| Refresh | `chgCaptcha()` sets `src = "/netbank/pages/jsp/html/CaptchaImage_2.jsp?reload=" + Date.now()` and clears `#TrxCaptchaKey` |
| HTTP | **200**, `Content-Type: image/png` |
| Image | PNG **100×50** (curl `file` on `captcha.bin`) |
| Session | Captcha response also sets `JSESSIONID` — treat captcha as **session-bound** |
| Input rules | Exactly **4 digits** (client `alert` + `isAlphaNumber1`) |

Artifacts: `evidence/hua-nan-h0/captcha.bin`, `captcha-headers.txt`.

---

## 5. Recommended `credentialSchema` for `hua_nan_bank_tw`

Align naming with existing First Bank payload style (`nationalId`, `userCode`, `password`) where possible; map to portal fields in the native adapter.

```ts
// Recommended CredentialField[] for provider hua_nan_bank_tw (H0 — login only)
[
  {
    key: "nationalId",
    label: "身分證字號",
    secret: false,
    required: true,
    // Portal: USERIDTEXT (visible) → USERID (hidden submitted)
    // Pattern: personal ID A123456789 (TokenCheck_PersonUserID in jstool.js)
  },
  {
    key: "userCode",          // 代號 / nickname
    label: "網銀代號",
    secret: false,
    required: true,
    // Portal: NICKNAME (plaintext cleared; hideNickName = ENC(...))
    // Length: maxlength 10; validation copy cites 6–10 alnum
  },
  {
    key: "password",
    label: "網銀密碼",
    secret: true,
    required: true,
    // Portal: PASSWORD → encipherExd → r_cipherpin/r_cipherkey[+2]; field cleared
    // Length: 8–16
  },
  {
    key: "captchaCode",
    label: "圖形驗證碼",
    secret: false,
    required: true,
    runtime: true,           // per attempt; OCR or manual
    // Portal: TrxCaptchaKey — 4 digits
  }
]
```

**Do not** put SSL password / OTP / device tokens in H0 schema until post-login probe confirms a gate.

### Suggested Provider Contract defaults (still TBD where noted)

| Capability / contract field | H0 recommendation |
|----------------------------|-------------------|
| `providerId` | `hua_nan_bank_tw` |
| Login URL | Start URL above (`Recognition=private`) |
| Captcha | Required image captcha; refresh via `?reload=` |
| Virtual keyboard | Optional; prefer **physical typing** path |
| Client crypto | Must run page `encipherExd` / JSEncrypt path (or faithfully reimplement) — **do not** POST raw password alone |
| `lookbackDays` default | **3** (align First Bank) with **≥1 floor** per plan v1.1.1 — **query UI max window NOT VERIFIED** |
| `identity_scheme` | Placeholder `huanan:portal-ref:v1` until post-login probe; fallback `huanan:fallback-hash:v1` |

---

## 6. `buildTransactionIdentity` — unknowns after login

H0 **cannot** freeze identity. Still needed from a logged-in (H1+) probe:

| Unknown | Why it matters | Status |
|---------|----------------|--------|
| Account list DOM / trx names | Navigation anchors for WebView automation | **NOT VERIFIED** |
| Statement / detail query form | Date range controls, max lookback, pagination | **NOT VERIFIED** |
| Per-row bank-native keys | Prefer `portal-ref` over hash: e.g. 交易序號 / 參考號 / 帳務流水 / hidden `seq` | **NOT VERIFIED** |
| Field stability across export vs HTML | CSV/download vs on-screen table may differ | **NOT VERIFIED** |
| Timezone / booking vs value date | Identity must not include balance; clarify which date is canonical | **NOT VERIFIED** |
| Multi-account / 幣別 / 卡帳 | Composite key may need `accountId + bookingDate + portalRef` | **NOT VERIFIED** |
| Duplicate same-day same-amount rows | Whether portal exposes a unique ref or only description | **NOT VERIFIED** |
| Session / step-up (OTP, SSL, BHO) on query vs transfer | Affects whether silent re-login is enough for sync | **NOT VERIFIED** |

**Interim strategy (documentation only):**

1. Prefer bank-native reference when found → `huanan:portal-ref:v1`  
2. Else stable hash of `(accountId, bookingDate, amountMinor, description, portalRowIndex?)` → `huanan:fallback-hash:v1`  
3. **Never** include `balanceMinor` in identity (Architecture B rule)

---

## 7. Risks

| Risk | Severity | Notes |
|------|----------|-------|
| **Client-side password encipher** | High | Submit without executing `encipherExd` (RSA pubkey embedded in page + DES) will fail. WebView must allow page JS or reimplement exactly. |
| **Hidden `USERID` vs visible `USERIDTEXT`** | High | Same failure mode as First Bank hidden cust id. |
| **Nickname RSA + clear** | Medium | Automation must set nickname before `doSubmit`; after submit plaintext field is emptied. |
| **Virtual keyboard** | Medium | Optional but present; shuffled keys; Enter triggers `doSubmit`. Prefer never enabling for bots. |
| **Captcha** | High | Session-bound PNG; 4 digits; OCR + manual fallback (First Bank pattern reusable). |
| **BHO / OCX / native helpers** | High for **transfers**; Low for **read-only sync** *if* statement query is HTML-only | Installers under DigitSig (`EBankOcxInstall*.msi`, `HncbNetBankServiceInstall.exe`, Mac zip). **Whether inquiry needs BHO: NOT VERIFIED.** |
| **`cookie_inst` / anti-bot cookie packing** | Medium | Recent comment「HKU伏擊驗證 20251229」— headless fingerprints may be challenged post-submit. |
| **JSESSIONID / SameSite=None** | Medium | Cookie jar must be preserved across captcha + login POST. |
| **Big5-labeled JS assets** | Low | Several scripts served `charset=Big5`; page itself UTF-8 — encoding pitfalls in static analysis only. |
| **No public JSON account API** | Medium | Architecture B native path likely **WebView DOM scrape / form POST**, not clean REST. |
| **SSL / OTP later** | Unknown | May block high-risk actions; may or may not block balance/history — **NOT VERIFIED**. |

---

## Evidence index

| File | Description |
|------|-------------|
| `evidence/hua-nan-h0/login.html` | Full login HTML (curl) |
| `evidence/hua-nan-h0/headers.txt` | Login response headers |
| `evidence/hua-nan-h0/login.png` | Playwright full-page screenshot |
| `evidence/hua-nan-h0/playwright-dom.json` | Selector probe results |
| `evidence/hua-nan-h0/playwright-network.json` | Request/response log |
| `evidence/hua-nan-h0/captcha.bin` | Captcha PNG sample |
| `evidence/hua-nan-h0/captcha-headers.txt` | Captcha HTTP headers |
| `evidence/hua-nan-h0/Login.json` | Password-help JSON (BOM UTF-8) |
| `evidence/hua-nan-h0/Login.js` | XHR to `Login.json` |
| `evidence/hua-nan-h0/encrypt.js` | Crypto helpers |
| `evidence/hua-nan-h0/validateLoginChg.js` | Login validation + `encipherExd` |
| `evidence/hua-nan-h0/jquery.keyboard.js` | Virtual keyboard |
| `evidence/hua-nan-h0/BHO.html` | BHO download/notice page |

### Selector checklist (Playwright-confirmed, HTTP 200 page)

| Selector | Exists | Visible |
|----------|--------|---------|
| `#LoginForm_post` | Yes | Yes |
| `#USERIDTEXT` | Yes | Yes |
| `#USERID` | Yes | No (hidden) |
| `#NICKNAME` | Yes | Yes |
| `#password` | Yes | Yes |
| `#TrxCaptchaKey` | Yes | Yes |
| `#code_Cap` | Yes | Yes |
| `#littleKeyboard` | Yes | Yes («開啟小鍵盤») |

---

## Follow-ups (out of H0 scope)

1. **H1 logged-in probe** (with user-owned test credentials, offline from this report): account list anchors, statement query trx, max date window, row identity fields, whether BHO/OTP appears on inquiry.  
2. Freeze `lookbackDays` and `identity_scheme` in Provider Contract after H1.  
3. Implement native adapter only after H1; reuse First Bank patterns for captcha OCR/manual + hidden-field writes.

---

*End of H0 probe. No credentials used. No product code changes.*
