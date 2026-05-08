#!/usr/bin/env node
/**
 * 電子發票登入流程模擬腳本
 * 從 EInvoiceAutomation.java 提取 JS 腳本，在 mock DOM 環境中逐步執行登入流程，
 * 並輸出各步驟的診斷報告。
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOGIN_URL = 'https://www.einvoice.nat.gov.tw/accounts/login'
const QUERY_URL = 'https://www.einvoice.nat.gov.tw/portal/btc/mobile/btc502w/search'
const CHALLENGE_URL = 'https://www.einvoice.nat.gov.tw/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1'

// ─── Java 原始碼腳本提取 ──────────────────────────────────────────────────────

const javaSrc = readFileSync(
  resolve(__dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/EInvoiceAutomation.java'),
  'utf8',
)

function extractScript(methodPattern) {
  const idx = javaSrc.indexOf(methodPattern)
  if (idx === -1) throw new Error(`找不到方法 pattern: ${methodPattern}`)
  const from = javaSrc.slice(idx)
  const blockStart = from.indexOf('"""')
  if (blockStart === -1) throw new Error(`方法後沒有 text block: ${methodPattern}`)
  const content = from.slice(blockStart + 3)
  const endSemicolon = content.indexOf('""";')
  const endComma = content.indexOf('""",')
  let blockEnd
  if (endSemicolon === -1) blockEnd = endComma
  else if (endComma === -1) blockEnd = endSemicolon
  else blockEnd = Math.min(endSemicolon, endComma)
  if (blockEnd === -1) throw new Error(`Text block 未正確關閉: ${methodPattern}`)
  return content.slice(0, blockEnd).trim()
}

const selectCarrierScript = extractScript('static String buildSelectMobileCarrierScript()')
const formSnapshotScript = extractScript('static String buildLoginFormSnapshotScript()')
const loginDetectScript = extractScript('static String buildLoginPageDetectScript()')
const platformChallengeScript = extractScript('private static String buildPlatformChallengeDetectScript()')
const captchaSnapshotScript = extractScript('private static String buildCaptchaSnapshotScript()')

// buildSubmitLoginScript 使用 String.format，需替換 %s 佔位符
const submitTemplate = extractScript('static String buildSubmitLoginScript(')
const TEST_PHONE = '0910047171'
const TEST_PASSWORD = 'Swxd3167@'
const TEST_CAPTCHA = '5678'
let _fmtIdx = 0
const submitScript = submitTemplate.replace(/%s/g, () => [TEST_PHONE, TEST_PASSWORD, TEST_CAPTCHA][_fmtIdx++] ?? '')

// ─── Mock DOM 實作 ────────────────────────────────────────────────────────────

class MockEl {
  constructor(spec = {}) {
    this._tag = (spec.tag || 'div').toUpperCase()
    this._attrs = { ...spec.attrs }
    this._text = spec.text || ''
    this._visible = spec.visible !== false
    this._value = this._attrs.value || ''
    this.checked = false
    this.disabled = false
    this.dataset = {}
    for (const [k, v] of Object.entries(this._attrs)) {
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        this.dataset[camel] = v
      }
    }
    this.options = []
    this.style = {}
    this.complete = true
    this._clicked = false
    this._form = null
    this._children = []
    this._onBeforeClick = spec.onBeforeClick || null
  }

  get tagName() { return this._tag }
  get id() { return this._attrs.id || '' }
  get name() { return this._attrs.name || '' }
  get type() { return this._attrs.type || '' }
  get value() { return this._value }
  set value(v) { this._value = String(v) }
  get naturalWidth() { return this._visible ? 100 : 0 }
  get naturalHeight() { return this._visible ? 30 : 0 }
  get width() { return this._visible ? 100 : 0 }
  get height() { return this._visible ? 30 : 0 }
  get textContent() { return this._text + (this._children || []).map(c => c.textContent || '').join('') }
  get innerText() { return this.textContent }
  get innerHTML() { return '' }

  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null }
  setAttribute(name, value) { this._attrs[name] = String(value) }

  getBoundingClientRect() {
    return this._visible
      ? { width: 100, height: 30, top: 0, left: 0, bottom: 30, right: 100 }
      : { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 }
  }

  click() {
    if (this._onBeforeClick) this._onBeforeClick(this)
    this._clicked = true
  }

  dispatchEvent() { return true }
  addEventListener() {}
  removeEventListener() {}

  closest(selector) {
    if (this._form && matchEl(this._form, selector)) return this._form
    return null
  }

  querySelector(selector) { return matchAll(this._children || [], selector)[0] ?? null }
  querySelectorAll(selector) { return matchAll(this._children || [], selector) }
  matches(selector) { return matchEl(this, selector) }
}

// CSS 選擇器匹配（支援登入流程所需的子集）
function matchEl(el, selector) {
  if (!el || !selector) return false
  const sel = selector.trim()
  if (!sel) return false

  // 逗號：聯集
  if (sel.includes(',')) return sel.split(',').some(s => matchEl(el, s.trim()))

  // 純標籤名
  if (/^[a-z]+$/i.test(sel)) return el.tagName === sel.toUpperCase()

  // #id
  if (sel.startsWith('#')) return el.id === sel.slice(1)

  // .class → 跳過（mock 不使用 class）
  if (sel.startsWith('.')) return false

  // tag[attr="value"] 或 [attr="value"]
  const mExact = sel.match(/^([a-z]*)?\[([^\]]+?)="([^"]*)"\]$/i)
  if (mExact) {
    const [, tag, attr, val] = mExact
    if (tag && el.tagName !== tag.toUpperCase()) return false
    return el.getAttribute(attr) === val
  }

  // tag[attr*="value"] 或 [attr*="value"]
  const mContains = sel.match(/^([a-z]*)?\[([^\]]+?)\*="([^"]*)"\]$/i)
  if (mContains) {
    const [, tag, attr, val] = mContains
    if (tag && el.tagName !== tag.toUpperCase()) return false
    return String(el.getAttribute(attr) ?? '').includes(val)
  }

  // [attr] 屬性存在
  const mExists = sel.match(/^\[([^\]=*~|$^]+)\]$/)
  if (mExists) return el.getAttribute(mExists[1]) !== null

  return false
}

function matchAll(elements, selector) {
  if (!elements?.length) return []
  const parts = selector.split(',').map(s => s.trim())
  const seen = new WeakSet()
  const result = []
  for (const el of elements) {
    if (parts.some(p => matchEl(el, p)) && !seen.has(el)) {
      result.push(el)
      seen.add(el)
    }
    for (const child of matchAll(el._children ?? [], selector)) {
      if (!seen.has(child)) {
        result.push(child)
        seen.add(child)
      }
    }
  }
  return result
}

// 建立登入頁面所需的 mock 元素
function buildLoginPage() {
  const carrierBtn = new MockEl({
    tag: 'button',
    attrs: { 'aria-label': '手機條碼' },
    text: '手機條碼',
    visible: true,
  })

  const phoneInput = new MockEl({
    tag: 'input',
    attrs: { id: 'mobile_phone', name: 'mobile_phone', type: 'tel', placeholder: '手機號碼' },
    visible: false,
  })
  const passInput = new MockEl({
    tag: 'input',
    attrs: { id: 'loginPass', name: 'loginPass', type: 'password' },
    visible: false,
  })
  const captchaInput = new MockEl({
    tag: 'input',
    attrs: { id: 'captcha', name: 'captcha', maxlength: '4', placeholder: '驗證碼' },
    visible: false,
  })
  const submitBtn = new MockEl({
    tag: 'button',
    attrs: { type: 'submit' },
    text: '登入',
    visible: false,
  })

  const loginForm = new MockEl({ tag: 'form', visible: false })
  loginForm._children = [phoneInput, passInput, captchaInput, submitBtn]
  loginForm.submit = () => { loginForm._submitted = true }
  phoneInput._form = loginForm
  passInput._form = loginForm
  captchaInput._form = loginForm
  submitBtn._form = loginForm

  // 點擊載具 tab 後，表單元素才變為可見
  carrierBtn._onBeforeClick = () => {
    phoneInput._visible = true
    passInput._visible = true
    captchaInput._visible = true
    submitBtn._visible = true
    loginForm._visible = true
  }

  return { carrierBtn, phoneInput, passInput, captchaInput, submitBtn, loginForm }
}

function createPageContext(els, url, pageTitle = '財政部電子發票整合服務平台') {
  const allEls = Object.values(els)

  const document = {
    title: pageTitle,
    body: { innerText: '手機條碼登入 驗證碼 密碼' },
    documentElement: { textContent: '手機條碼登入 驗證碼 密碼', innerHTML: '' },
    readyState: 'complete',
    querySelector(sel) { return matchAll(allEls, sel)[0] ?? null },
    querySelectorAll(sel) { return matchAll(allEls, sel) },
    createElement() {
      const canvas = new MockEl({ tag: 'canvas' })
      canvas.getContext = () => null
      return canvas
    },
  }

  return {
    location: { href: url },
    document,
    window: { HTMLInputElement: { prototype: {} } },
    getComputedStyle: (el) => ({
      display: el?._visible ? 'block' : 'none',
      visibility: el?._visible ? 'visible' : 'hidden',
    }),
    // 必要的 JS 全域
    Event: class { constructor(t, o) { this.type = t; this.bubbles = !!o?.bubbles } },
    String: globalThis.String,
    Boolean: globalThis.Boolean,
    Array: globalThis.Array,
    Object: globalThis.Object,
    Math: globalThis.Math,
    Number: globalThis.Number,
    Date: globalThis.Date,
    RegExp: globalThis.RegExp,
    JSON: globalThis.JSON,
    parseInt: globalThis.parseInt,
    parseFloat: globalThis.parseFloat,
    isNaN: globalThis.isNaN,
  }
}

function runScript(script, context) {
  return vm.runInNewContext(script, context)
}

// ─── 診斷報告輸出 ─────────────────────────────────────────────────────────────

const PASS = '✓ PASS'
const FAIL = '✗ FAIL'
const report = []

function check(label, value, expected, description) {
  const pass = value === expected
  const icon = pass ? PASS : FAIL
  const entry = { label, pass, value, expected, description }
  report.push(entry)
  const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value)
  console.log(`  ${icon}  ${label}: ${valueStr}`)
  if (!pass) {
    console.log(`         ↳ 期望: ${JSON.stringify(expected)}`)
    console.log(`         ↳ 說明: ${description}`)
  }
  return pass
}

function checkTrue(label, value, description) {
  return check(label, Boolean(value), true, description)
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

// ─── 模擬執行 ─────────────────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║     電子發票登入流程模擬診斷報告                         ║')
console.log('╚══════════════════════════════════════════════════════════╝')
console.log(`測試帳號: ${TEST_PHONE}  驗證碼(mock): ${TEST_CAPTCHA}`)

const els = buildLoginPage()

// ── Step 0: 平台 Cloudflare 挑戰偵測（正常頁面，不應觸發）──────────────────

section('Step 0  平台挑戰偵測（正常登入頁應為 false）')
const ctxChallenge = createPageContext(els, LOGIN_URL, '財政部電子發票整合服務平台')
const challengeResult = runScript(platformChallengeScript, ctxChallenge)
console.log(`  原始結果: ${JSON.stringify(challengeResult)}`)
checkTrue('title 不含 Cloudflare 特徵', !challengeResult?.challenge, '正常登入頁不應觸發平台挑戰，否則會直接拋出 einvoice_platform_challenge 錯誤')

// ── Step 1: 手機載具選取 ────────────────────────────────────────────────────

section('Step 1  選取手機條碼載具')
const ctx1 = createPageContext(els, LOGIN_URL)
const carrierResult = runScript(selectCarrierScript, ctx1)
console.log(`  原始結果: ${JSON.stringify(carrierResult)}`)
checkTrue('selected === true', carrierResult?.selected, '載具選取必須成功，否則後續登入表單不會顯示')
checkTrue('carrierBtn.click() 被呼叫', els.carrierBtn._clicked, '應點擊手機條碼 tab/button')
checkTrue('phoneInput 變為可見', els.phoneInput._visible, '點擊載具後手機號碼欄位應變為可見')

// ── Step 2: 登入表單穩定性快照 ────────────────────────────────────────────────

section('Step 2  登入表單穩定性快照')
const ctx2 = createPageContext(els, LOGIN_URL)
const formSnap = runScript(formSnapshotScript, ctx2)
console.log(`  原始結果: ${JSON.stringify(formSnap)}`)
checkTrue('mobileFieldVisible', formSnap?.mobileFieldVisible, '手機號碼欄位必須可見，否則 waitForMobileCarrierLoginFormStable 永遠等待')
checkTrue('passwordFieldVisible', formSnap?.passwordFieldVisible, '密碼欄位必須可見')
checkTrue('captchaVisible', formSnap?.captchaVisible, '驗證碼欄位必須可見')
check('url 正確', formSnap?.url, LOGIN_URL, '快照 URL 應為登入頁')

// ── Step 3: 驗證碼影像偵測 ────────────────────────────────────────────────────

section('Step 3  驗證碼影像快照（mock 無圖，預期 ready=false）')
const ctx3 = createPageContext(els, LOGIN_URL)
const captchaSnap = runScript(captchaSnapshotScript, ctx3)
console.log(`  原始結果: ${JSON.stringify(captchaSnap)}`)
// Mock 沒有 captcha 圖，這是預期的——實際裝置上會有真實圖片
check('captchaSnap.ready', captchaSnap?.ready, false, 'Mock 環境無真實驗證碼圖片，ready=false 是正常的')
checkTrue('有 reason 說明', Boolean(captchaSnap?.reason), '應提供失敗原因，方便 debug')

// ── Step 4: 登入表單填寫與送出 ──────────────────────────────────────────────

section('Step 4  填寫並送出登入表單')
const ctx4 = createPageContext(els, LOGIN_URL)
const submitResult = runScript(submitScript, ctx4)
console.log(`  原始結果: ${JSON.stringify(submitResult)}`)
checkTrue('submitted === true', submitResult?.submitted, '必須成功找到所有欄位並點擊送出')
check('phone 填入正確', els.phoneInput.value, TEST_PHONE, '手機號碼欄位必須被填入正確值')
check('password 填入正確', els.passInput.value, TEST_PASSWORD, '密碼欄位必須被填入正確值')
check('captcha 填入正確', els.captchaInput.value, TEST_CAPTCHA, '驗證碼欄位必須被填入正確值')
checkTrue('submitBtn.click() 被呼叫', els.submitBtn._clicked, '必須點擊送出按鈕')

// ── Step 4A: 詳細追蹤 - setVal 值設定時序、事件清單、submit 按鈕查找路徑 ──

section('Step 4A  詳細追蹤（輸入框值設定 / 事件序列 / submit 路徑）')

// 建立帶錄製功能的 instrumented 頁面
class InstrumentedEl extends MockEl {
  constructor(spec, label) {
    super(spec)
    this._label = label
    this._valueLog = []  // { value, afterNativeSetter }
    this._eventLog = []  // 事件名稱序列
    this._clickLog = []  // 每次 click 的時間戳
  }

  set value(v) {
    this._value = String(v)
    this._valueLog.push(String(v))
  }
  get value() { return this._value }

  dispatchEvent(evt) {
    this._eventLog.push(evt?.type || String(evt))
    return true
  }

  click() {
    if (this._onBeforeClick) this._onBeforeClick(this)
    this._clicked = true
    this._clickLog.push(Date.now())
  }
}

function buildInstrumentedLoginPage() {
  const carrierBtn = new InstrumentedEl({
    tag: 'button', attrs: { 'aria-label': '手機條碼' }, text: '手機條碼', visible: true,
  }, 'carrierBtn')

  const phoneInput = new InstrumentedEl({
    tag: 'input',
    attrs: { id: 'mobile_phone', name: 'mobile_phone', type: 'tel', placeholder: '手機號碼' },
    visible: false,
  }, 'phoneInput')
  const passInput = new InstrumentedEl({
    tag: 'input',
    attrs: { id: 'loginPass', name: 'loginPass', type: 'password' },
    visible: false,
  }, 'passInput')
  const captchaInput = new InstrumentedEl({
    tag: 'input',
    attrs: { id: 'captcha', name: 'captcha', maxlength: '4', placeholder: '驗證碼' },
    visible: false,
  }, 'captchaInput')
  const submitBtn = new InstrumentedEl({
    tag: 'button', attrs: { type: 'submit' }, text: '登入', visible: false,
  }, 'submitBtn')

  const loginForm = new MockEl({ tag: 'form', visible: false })
  loginForm._children = [phoneInput, passInput, captchaInput, submitBtn]
  loginForm.submit = () => { loginForm._submitted = true }
  phoneInput._form = loginForm
  passInput._form = loginForm
  captchaInput._form = loginForm
  submitBtn._form = loginForm

  carrierBtn._onBeforeClick = () => {
    phoneInput._visible = true
    passInput._visible = true
    captchaInput._visible = true
    submitBtn._visible = true
    loginForm._visible = true
  }

  // 先執行 carrier 選取讓表單可見（模擬 Step 1 已完成）
  carrierBtn.click()

  return { carrierBtn, phoneInput, passInput, captchaInput, submitBtn, loginForm }
}

// 建立 instrumented 頁面並執行 submit script
const iEls = buildInstrumentedLoginPage()

// 修改 window 以追蹤 nativeInputSetter 是否被使用
const nativeSetterCallLog = []
const instrumentedWindow = {
  HTMLInputElement: {
    prototype: Object.defineProperty({}, 'value', {
      set(v) {
        nativeSetterCallLog.push({ element: this?._label ?? '?', value: v })
        if (this._valueLog) this._valueLog.push(String(v))
        this._value = String(v)
      },
      get() { return this._value },
      configurable: true,
    }),
  },
}

const ctx4a = createPageContext(iEls, LOGIN_URL)
ctx4a.window = instrumentedWindow
// 讓 Object.getOwnPropertyDescriptor 能取得 nativeInputSetter
ctx4a.Object = Object

const submit4aResult = runScript(submitScript, ctx4a)

// 輸出詳細追蹤結果
console.log('\n  ── 各欄位操作追蹤 ──')

const fields = [
  { name: '手機號碼 (phoneInput)', el: iEls.phoneInput, expected: TEST_PHONE },
  { name: '密碼    (passInput)',   el: iEls.passInput,   expected: TEST_PASSWORD },
  { name: '驗證碼  (captchaInput)', el: iEls.captchaInput, expected: TEST_CAPTCHA },
]

let allFieldsOk = true
for (const { name, el, expected } of fields) {
  const finalValue = el.value
  const valueOk = finalValue === expected
  const events = el._eventLog
  const valueHistory = el._valueLog

  console.log(`\n  [${name}]`)
  console.log(`    最終值:     ${JSON.stringify(finalValue)}   期望: ${JSON.stringify(expected)}   ${valueOk ? '✓' : '✗ MISMATCH'}`)
  console.log(`    值設定歷程: ${JSON.stringify(valueHistory)}`)
  console.log(`    事件序列:   ${JSON.stringify(events)}`)

  if (!valueOk) allFieldsOk = false

  // 驗證事件序列完整性（正確順序: input → keyup → change → blur）
  const requiredEvents = ['input', 'keyup', 'change', 'blur']
  for (const ev of requiredEvents) {
    if (!events.includes(ev)) {
      console.log(`    ⚠  缺少事件: ${ev}`)
      allFieldsOk = false
    }
  }
  if (events.indexOf('input') > events.indexOf('keyup')) {
    console.log('    ⚠  事件順序異常: input 應在 keyup 之前')
    allFieldsOk = false
  }
  if (events.indexOf('keyup') > events.indexOf('change')) {
    console.log('    ⚠  事件順序異常: keyup 應在 change 之前（符合真實瀏覽器行為）')
    allFieldsOk = false
  }
}

console.log('\n  ── Submit 按鈕追蹤 ──')
const submitOk = iEls.submitBtn._clicked
const submitReason = submit4aResult?.reason ?? 'unknown'
console.log(`    click() 被呼叫: ${submitOk ? '是 ✓' : '否 ✗'}`)
console.log(`    送出方式:       ${submitReason}`)
if (submitReason === 'clicked_submit') {
  console.log('    路徑: phoneEl.closest("form") → querySelector("button[type=submit]") → .click()')
} else if (submitReason === 'submitted_form') {
  console.log('    路徑: phoneEl.closest("form") → form.submit() (fallback)')
} else {
  console.log(`    路徑: 未知 (${submitReason})`)
}

console.log('\n  ── nativeInputSetter 使用追蹤 ──')
if (nativeSetterCallLog.length > 0) {
  console.log(`    ✓ nativeInputSetter 被正確呼叫 ${nativeSetterCallLog.length} 次`)
  for (const log of nativeSetterCallLog) {
    console.log(`      → element="${log.element}" value=${JSON.stringify(log.value)}`)
  }
} else {
  console.log('    ⚠  nativeInputSetter 未被呼叫（fallback 至 el.value = value）')
  console.log('    說明: 在真實 Android WebView 中，nativeInputSetter 應存在。')
  console.log('          若 React/Vue 框架控制 input，缺少 nativeInputSetter 呼叫可能導致')
  console.log('          框架 state 未更新，form submit 時傳送舊值。')
}

checkTrue('Step 4A: 所有欄位值正確填入', allFieldsOk, '每個輸入框的最終值必須與預期相符')
checkTrue('Step 4A: submit 按鈕確認點擊', submitOk, 'submit 按鈕必須被 .click() 呼叫')

// ── Step 5: 登入頁面偵測（在登入頁時應回傳 true）────────────────────────────

section('Step 5  登入頁面偵測（在 /accounts/login → 應回傳 true）')
const ctx5 = createPageContext(els, LOGIN_URL)
const onLoginPage = runScript(loginDetectScript, ctx5)
console.log(`  原始結果: ${onLoginPage}`)
check('loginDetect at LOGIN_URL', onLoginPage, true, '在登入頁時必須回傳 true，waitForLoginSuccess 才能正確等待')

// ── Step 6: 登入成功偵測（導航至查詢頁後應回傳 false）─────────────────────

section('Step 6  登入成功偵測（導航至 /portal 查詢頁 → 應回傳 false）')
const ctx6 = createPageContext(els, QUERY_URL)
const afterLogin = runScript(loginDetectScript, ctx6)
console.log(`  原始結果: ${afterLogin}`)
check('loginDetect at QUERY_URL', afterLogin, false,
  '[SMB-174 關鍵修復] URL 離開 /accounts/login 後必須回傳 false，代表登入成功。' +
  '修復前使用 input[type="tel"]/input[type="password"] 選擇器，查詢頁也有這些元素，導致永遠回傳 true')

// ── Step 7: Cloudflare 挑戰 URL 偵測 ─────────────────────────────────────

section('Step 7  Cloudflare 挑戰 URL 偵測（應正確識別）')
const ctxChallengeUrl = createPageContext(els, CHALLENGE_URL, 'Just a moment...')
// Override document body to simulate cloudflare page
ctxChallengeUrl.document.body = { innerText: 'Checking if the site connection is secure. Cloudflare' }
ctxChallengeUrl.document.documentElement = {
  textContent: 'Checking if the site connection is secure. Cloudflare',
  innerHTML: '',
}
const challengeUrlResult = runScript(platformChallengeScript, ctxChallengeUrl)
console.log(`  原始結果: ${JSON.stringify(challengeUrlResult)}`)
checkTrue('challenge URL 偵測到 Cloudflare', challengeUrlResult?.challenge,
  '當 URL 含有 /cdn-cgi/challenge-platform/ 時必須偵測為平台挑戰')

// ─── 最終報告 ─────────────────────────────────────────────────────────────────

const total = report.length
const passed = report.filter(r => r.pass).length
const failed = total - passed
const allPassed = failed === 0

console.log('\n' + '═'.repeat(60))
console.log('  診斷報告摘要')
console.log('═'.repeat(60))
console.log(`  總計: ${total} 項   通過: ${passed} 項   失敗: ${failed} 項`)
console.log()

if (failed > 0) {
  console.log('  ─ 失敗項目：')
  for (const r of report.filter(r => !r.pass)) {
    console.log(`    ✗ ${r.label}`)
    console.log(`      說明: ${r.description}`)
    console.log(`      實際值: ${JSON.stringify(r.value)}  期望值: ${JSON.stringify(r.expected)}`)
  }
  console.log()
}

if (allPassed) {
  console.log('  所有診斷項目通過。電子發票登入流程邏輯正確。')
} else {
  console.log('  ⚠  部分診斷項目失敗，請根據上方說明進行修復。')
  process.exitCode = 1
}
console.log('═'.repeat(60))
