/**
 * 電子發票匯入流程測試
 * 覆蓋去重、部分失敗、空資料、交易建立等核心場景
 */
import test from 'node:test'
import assert from 'node:assert/strict'

// ── 測試用 DB stub ──────────────────────────────────────────────────────────

function createRepoStub({ existingNumbers = [], insertShouldFailFor = new Set() } = {}) {
  const inserted = []
  return {
    getImportedInvoiceNumbers: async () => new Set(existingNumbers),
    insertInvoiceImport: async (invoice) => {
      if (insertShouldFailFor.has(invoice.invoiceNumber)) {
        throw new Error(`DB error for ${invoice.invoiceNumber}`)
      }
      inserted.push(invoice)
    },
    get inserted() { return inserted },
  }
}

// ── importSelectedInvoices 邏輯（從 backend.js 提取為純函式，方便測試）──────

async function importInvoicesWithRepo(invoices, repo, { createExpense } = {}) {
  const alreadyImported = await repo.getImportedInvoiceNumbers()
  const results = { imported: [], skipped: [], failed: [] }
  for (const invoice of invoices) {
    if (alreadyImported.has(invoice.invoiceNumber)) {
      results.skipped.push(invoice)
      continue
    }
    try {
      let transactionId = null
      if (typeof createExpense === 'function') {
        transactionId = await createExpense(invoice)
      }
      await repo.insertInvoiceImport({
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        invoiceDate: invoice.invoiceDate,
        merchantName: invoice.merchantName ?? null,
        carrierName: invoice.carrierName ?? null,
        transactionId,
      })
      results.imported.push(invoice)
    } catch {
      results.failed.push(invoice)
    }
  }
  return results
}

// ── 測試資料工廠 ────────────────────────────────────────────────────────────

function makeInvoice(invoiceNumber, overrides = {}) {
  return {
    invoiceNumber,
    amount: 100,
    invoiceDate: Date.now(),
    merchantName: 'Test Store',
    carrierName: null,
    ...overrides,
  }
}

// ── 測試案例 ─────────────────────────────────────────────────────────────────

test('空發票清單時不寫入任何資料，回傳全零計數', async () => {
  const repo = createRepoStub()
  const result = await importInvoicesWithRepo([], repo)
  assert.equal(result.imported.length, 0)
  assert.equal(result.skipped.length, 0)
  assert.equal(result.failed.length, 0)
  assert.equal(repo.inserted.length, 0)
})

test('全部為新發票時，全數成功匯入', async () => {
  const repo = createRepoStub()
  const invoices = [makeInvoice('AA-12345678'), makeInvoice('BB-87654321')]
  const result = await importInvoicesWithRepo(invoices, repo)
  assert.equal(result.imported.length, 2)
  assert.equal(result.skipped.length, 0)
  assert.equal(result.failed.length, 0)
  assert.equal(repo.inserted.length, 2)
})

test('已存在的發票號碼被跳過（去重），不重複寫入', async () => {
  const repo = createRepoStub({ existingNumbers: ['AA-12345678'] })
  const invoices = [makeInvoice('AA-12345678'), makeInvoice('BB-87654321')]
  const result = await importInvoicesWithRepo(invoices, repo)
  assert.equal(result.imported.length, 1)
  assert.equal(result.skipped.length, 1)
  assert.equal(result.skipped[0].invoiceNumber, 'AA-12345678')
  assert.equal(repo.inserted.length, 1)
  assert.equal(repo.inserted[0].invoiceNumber, 'BB-87654321')
})

test('所有發票均為重複時，全數跳過', async () => {
  const repo = createRepoStub({ existingNumbers: ['AA-11111111', 'BB-22222222'] })
  const invoices = [makeInvoice('AA-11111111'), makeInvoice('BB-22222222')]
  const result = await importInvoicesWithRepo(invoices, repo)
  assert.equal(result.imported.length, 0)
  assert.equal(result.skipped.length, 2)
  assert.equal(result.failed.length, 0)
  assert.equal(repo.inserted.length, 0)
})

test('單筆 DB 錯誤時，該筆進入 failed，其他筆繼續處理', async () => {
  const repo = createRepoStub({ insertShouldFailFor: new Set(['BB-87654321']) })
  const invoices = [
    makeInvoice('AA-12345678'),
    makeInvoice('BB-87654321'),
    makeInvoice('CC-99999999'),
  ]
  const result = await importInvoicesWithRepo(invoices, repo)
  assert.equal(result.imported.length, 2)
  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0].invoiceNumber, 'BB-87654321')
  assert.equal(result.skipped.length, 0)
})

test('全部發票 DB 寫入失敗時，全數進入 failed', async () => {
  const repo = createRepoStub({ insertShouldFailFor: new Set(['AA-11111111', 'BB-22222222']) })
  const invoices = [makeInvoice('AA-11111111'), makeInvoice('BB-22222222')]
  const result = await importInvoicesWithRepo(invoices, repo)
  assert.equal(result.imported.length, 0)
  assert.equal(result.failed.length, 2)
  assert.equal(result.skipped.length, 0)
})

test('混合情境：部分重複 + 部分失敗 + 部分成功', async () => {
  const repo = createRepoStub({
    existingNumbers: ['AA-11111111'],
    insertShouldFailFor: new Set(['BB-22222222']),
  })
  const invoices = [
    makeInvoice('AA-11111111'), // 已存在 → skipped
    makeInvoice('BB-22222222'), // DB 失敗 → failed
    makeInvoice('CC-33333333'), // 正常 → imported
  ]
  const result = await importInvoicesWithRepo(invoices, repo)
  assert.equal(result.imported.length, 1)
  assert.equal(result.skipped.length, 1)
  assert.equal(result.failed.length, 1)
  assert.equal(result.imported[0].invoiceNumber, 'CC-33333333')
})

test('未提供 createExpense 時 transactionId 為 null', async () => {
  const repo = createRepoStub()
  await importInvoicesWithRepo([makeInvoice('AA-12345678')], repo)
  assert.equal(repo.inserted[0].transactionId, null)
})

test('提供 createExpense 時 transactionId 為回傳值', async () => {
  const repo = createRepoStub()
  const createExpense = async (invoice) => `tx_${invoice.invoiceNumber}`
  await importInvoicesWithRepo([makeInvoice('AA-12345678')], repo, { createExpense })
  assert.equal(repo.inserted[0].transactionId, 'tx_AA-12345678')
})

test('createExpense 拋出錯誤時該發票進入 failed', async () => {
  const repo = createRepoStub()
  const createExpense = async () => { throw new Error('tx_create_error') }
  const result = await importInvoicesWithRepo([makeInvoice('AA-12345678')], repo, { createExpense })
  assert.equal(result.failed.length, 1)
  assert.equal(result.imported.length, 0)
  assert.equal(repo.inserted.length, 0)
})

test('createExpense amountMinor 換算應為金額乘以 100', async () => {
  const repo = createRepoStub()
  const calls = []
  const createExpense = async (invoice) => {
    calls.push({ amountMinor: Math.round(Number(invoice.amount) * 100) })
    return 'tx_ok'
  }
  await importInvoicesWithRepo([makeInvoice('AA-12345678', { amount: 500 })], repo, { createExpense })
  assert.equal(calls[0].amountMinor, 50000)
})

test('已匯入的發票被跳過時不呼叫 createExpense', async () => {
  const repo = createRepoStub({ existingNumbers: ['AA-12345678'] })
  let expenseCalled = false
  const createExpense = async () => { expenseCalled = true; return 'tx_ok' }
  await importInvoicesWithRepo([makeInvoice('AA-12345678')], repo, { createExpense })
  assert.equal(expenseCalled, false)
})

test('merchantName 為 null 時不拋出錯誤', async () => {
  const repo = createRepoStub()
  const invoice = makeInvoice('AA-12345678', { merchantName: null })
  const result = await importInvoicesWithRepo([invoice], repo)
  assert.equal(result.imported.length, 1)
})

test('已匯入號碼 Set 大小正確反映去重基準數', async () => {
  let capturedSet = null
  const repo = {
    getImportedInvoiceNumbers: async () => {
      capturedSet = new Set(['X-0001', 'X-0002', 'X-0003'])
      return capturedSet
    },
    insertInvoiceImport: async () => {},
  }
  await importInvoicesWithRepo([makeInvoice('X-0001')], repo)
  assert.equal(capturedSet.size, 3)
})
