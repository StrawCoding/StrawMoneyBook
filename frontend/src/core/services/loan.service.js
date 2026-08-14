import { withTransaction } from '@/core/db/sqlite'
import { nowIso } from '@/core/utils/id'
import { findAccountById } from '@/core/repositories/account.repo'
import { ensureCounterpartyByName } from '@/core/repositories/counterparty.repo'
import {
  createCategory,
  createCategoryGroup,
  listCategories,
  listCategoryGroups,
} from '@/core/repositories/category.repo'
import {
  countLoans,
  createLoan,
  createLoanPayment,
  deleteLoanPaymentById,
  deleteLoanPaymentsByLoanId,
  getLoanById,
  getLoanPaymentById,
  getLoanPaymentByGeneratedTransactionId,
  getLoanSetupTransaction,
  listLoanPayments,
  listLoans,
  softDeleteLoanById,
  sumLoanPaymentsAmountExcluding,
  updateLoanPaymentById,
  updateLoanPrincipalById,
  updateLoanStatus,
} from '@/core/repositories/loan.repo'
import {
  addTransaction,
  findTransactionByIdempotencyKey,
  softDeleteTransactionById,
  softDeleteTransactionsByOriginRef,
  updateTransactionById,
} from '@/core/repositories/transaction.repo'
import { assertCanCreateLoan } from '@/core/services/membership.service'
import { isSavingsJarAccount } from '@/core/repositories/savings-jar.repo'
import {
  toLoanOpenPrincipalMinor,
  toLoanRepaymentInterestMinor,
  toLoanRepaymentPrincipalMinor,
} from '@/core/domain/posting/loan-posting-policy.js'

function validateDirection(direction) {
  if (!['lend', 'borrow'].includes(direction)) {
    throw new Error('direction 僅可為 lend 或 borrow')
  }
}

function validateAmountMinor(amountMinor, fieldName = 'amountMinor') {
  const amount = Number(amountMinor)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${fieldName} 必須為大於 0 的整數`)
  }
  return Math.round(amount)
}

function validateOptionalAmountMinor(amountMinor, fieldName = 'amountMinor') {
  if (amountMinor === null || amountMinor === undefined || amountMinor === '') return 0
  const amount = Number(amountMinor)
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`${fieldName} 必須為大於等於 0 的整數`)
  }
  return Math.round(amount)
}

function parseInterestRuleJson(rawRule) {
  if (!rawRule) return { presetInterestMinor: 0 }
  try {
    const parsed = JSON.parse(String(rawRule))
    const presetInterestMinor = Math.max(0, Math.round(Number(parsed?.presetInterestMinor ?? 0)))
    return { presetInterestMinor }
  } catch {
    return { presetInterestMinor: 0 }
  }
}

function normalizeLoanRecord(loan) {
  if (!loan) return null

  const principalMinor = Math.max(0, Number(loan.principal_minor ?? 0))
  const paidMinor = Math.max(0, Number(loan.paid_minor ?? 0))
  const { presetInterestMinor } = parseInterestRuleJson(loan.interest_rule_json)

  const principalPaidMinor = Math.min(principalMinor, paidMinor)
  const interestPaidMinor = Math.max(0, paidMinor - principalMinor)
  const targetTotalMinor = principalMinor + presetInterestMinor
  const remainingMinor = Math.max(0, targetTotalMinor - paidMinor)
  const interestRemainingMinor = Math.max(0, presetInterestMinor - interestPaidMinor)

  return {
    ...loan,
    preset_interest_minor: presetInterestMinor,
    target_total_minor: targetTotalMinor,
    principal_paid_minor: principalPaidMinor,
    principal_remaining_minor: Math.max(0, principalMinor - principalPaidMinor),
    interest_paid_minor: interestPaidMinor,
    interest_remaining_minor: interestRemainingMinor,
    remaining_minor: remainingMinor,
  }
}

function nextLoanStatus(targetTotalMinor, paidMinor) {
  if (paidMinor <= 0) return 'active'
  if (paidMinor >= targetTotalMinor) return 'settled'
  return 'partial'
}

function resolveLoanStatusAfterPaymentChange(loan, targetTotalMinor, nextPaidMinor) {
  if (String(loan?.status ?? '') === 'void') {
    return {
      status: 'void',
      settledAt: null,
    }
  }

  const status = nextLoanStatus(targetTotalMinor, nextPaidMinor)
  return {
    status,
    settledAt: status === 'settled' ? nowIso() : null,
  }
}

function normalizeLoanCounterpartyName(rawName) {
  return String(rawName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function loanBatchSortTime(loan) {
  const raw = String(loan?.start_date ?? loan?.setup_occurred_at ?? loan?.created_at ?? '')
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

function sortLoansForBatchRepayment(loans = []) {
  return [...loans].sort((a, b) => {
    const timeDiff = loanBatchSortTime(a) - loanBatchSortTime(b)
    if (timeDiff !== 0) return timeDiff
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  })
}

function resolveLoanCollectionLabel(loan) {
  return loan?.direction === 'borrow' ? '歸還' : '收回'
}

function buildLoanPaymentNote(loan) {
  return `借貸${resolveLoanCollectionLabel(loan)}：${loan?.counterparty_name ?? ''}`
}

async function assertLoanTransactionAccount(ledgerId, accountId) {
  const normalizedAccountId = String(accountId ?? '').trim()
  if (!normalizedAccountId) {
    throw new Error('請選擇帳戶')
  }
  const account = await findAccountById(ledgerId, normalizedAccountId)
  if (!account) {
    throw new Error('找不到帳戶')
  }
  if (await isSavingsJarAccount(ledgerId, normalizedAccountId)) {
    throw new Error('存錢罐不可直接作為借貸帳戶')
  }
}

async function ensureLoanInterestCategory(ledgerId, kind) {
  const categories = await listCategories(ledgerId, { includeArchived: true })
  const existing = categories.find(
    (item) => item.name === '借貸利息' && !Number(item.is_archived) && (item.kind === kind || item.kind === 'both'),
  )
  if (existing) return existing.id

  const groups = await listCategoryGroups(ledgerId)
  let group = groups.find((item) => !Number(item.is_archived) && (item.kind === kind || item.kind === 'both'))
  if (!group) {
    group = await createCategoryGroup(ledgerId, {
      name: kind === 'income' ? '收入' : '支出',
      kind,
      sortOrder: groups.length,
    })
  }

  const created = await createCategory(ledgerId, {
    groupId: group.id,
    name: '借貸利息',
    kind,
    icon: 'fa-solid fa-percent',
    isBudgetable: kind === 'expense' ? 1 : 0,
    sortOrder: categories.filter((item) => item.group_id === group.id).length,
  })
  return created.id
}

export async function loadLoanDashboard(ledgerId) {
  const loans = (await listLoans(ledgerId)).map((loan) => normalizeLoanRecord(loan))
  const activeCount = loans.filter((loan) => ['active', 'partial'].includes(loan.status)).length
  const totalReceivable = loans
    .filter((loan) => loan.direction === 'lend' && loan.status !== 'void')
    .reduce((total, loan) => total + Number(loan.remaining_minor ?? 0), 0)
  const totalPayable = loans
    .filter((loan) => loan.direction === 'borrow' && loan.status !== 'void')
    .reduce((total, loan) => total + Number(loan.remaining_minor ?? 0), 0)

  return {
    loans,
    summary: {
      activeCount,
      totalReceivable,
      totalPayable,
    },
  }
}

export async function createLoanWithOptionalTransaction(ledgerId, payload) {
  validateDirection(payload.direction)
  const principalMinor = validateAmountMinor(payload.principalMinor, 'principalMinor')
  const interestMinor = validateOptionalAmountMinor(payload.interestMinor, 'interestMinor')

  if (!payload.counterpartyName?.trim()) {
    throw new Error('請輸入借貸對象')
  }

  if (!payload.startDate) {
    throw new Error('請輸入開始日期')
  }

  if (!payload.accountId) {
    throw new Error('請選擇帳戶，借貸建立需要同步入帳')
  }

  const existingLoanCount = await countLoans(ledgerId)
  assertCanCreateLoan(existingLoanCount)

  return withTransaction(async () => {
    const counterpartyId = await ensureCounterpartyByName(ledgerId, payload.counterpartyName)

    const loan = await createLoan(ledgerId, {
      counterpartyId,
      direction: payload.direction,
      principalMinor,
      interestRuleJson: interestMinor > 0 ? JSON.stringify({ presetInterestMinor: interestMinor }) : null,
      startDate: payload.startDate,
      dueDate: payload.dueDate ?? null,
      note: payload.note ?? null,
      status: 'active',
    })

    const txType = payload.direction === 'lend' ? 'expense' : 'income'
    const amountMinor = toLoanOpenPrincipalMinor(payload.direction, principalMinor)
    const setupTxId = await addTransaction(ledgerId, {
      type: txType,
      accountId: payload.accountId,
      categoryId: payload.categoryId ?? null,
      amountMinor,
      occurredAt: payload.occurredAt ?? nowIso(),
      note: payload.note ?? `借貸建立：${payload.counterpartyName}`,
      originType: 'loan_payment',
      externalRefId: loan.id,
      includeInBudget: false,
      includeInAnalysis: false,
    })

    return {
      ...loan,
      setup_tx_id: setupTxId,
    }
  })
}

export async function addLoanRepayment(ledgerId, payload) {
  return withTransaction(async () => addLoanRepaymentInternal(ledgerId, payload))
}

async function addLoanRepaymentInternal(ledgerId, payload) {
  const amountMinor = validateAmountMinor(payload.amountMinor, 'repaymentAmountMinor')

  if (!payload.loanId) {
    throw new Error('loanId 為必填')
  }

  if (!payload.accountId) {
    throw new Error('還款必須指定帳戶')
  }

  const loan = normalizeLoanRecord(await getLoanById(ledgerId, payload.loanId))
  if (!loan) {
    throw new Error('找不到借貸資料')
  }

  if (loan.status === 'void') {
    throw new Error('已作廢借貸不可還款')
  }

  const idempotencyKey = String(payload.idempotencyKey ?? '').trim()
  if (idempotencyKey) {
    const existingTx = await findTransactionByIdempotencyKey(ledgerId, idempotencyKey)
    if (existingTx?.id) {
      const payment = await getLoanPaymentByGeneratedTransactionId(ledgerId, existingTx.id)
      const paidMinor = Number(loan.paid_minor ?? 0)
      const targetTotalMinor = Number(loan.target_total_minor ?? loan.principal_minor ?? 0)
      return {
        loanId: loan.id,
        paymentId: payment?.id ?? null,
        txId: existingTx.id,
        interestTxId: payment?.generated_interest_tx_id ?? null,
        status: loan.status,
        principalComponentMinor: Math.max(0, Math.round(Number(payment?.principal_component_minor ?? 0))),
        interestComponentMinor: Math.max(0, Math.round(Number(payment?.interest_component_minor ?? 0))),
        remainingMinor: Math.max(0, targetTotalMinor - paidMinor),
        alreadyProcessed: true,
      }
    }
  }

  const paidMinor = Number(loan.paid_minor ?? 0)
  const principalMinor = Number(loan.principal_minor ?? 0)
  const presetInterestMinor = Number(loan.preset_interest_minor ?? 0)
  const targetTotalMinor = Number(loan.target_total_minor ?? principalMinor)
  const remainingMinor = Math.max(0, targetTotalMinor - paidMinor)

  if (remainingMinor <= 0) {
    throw new Error('此借貸已結清')
  }
  if (presetInterestMinor > 0 && amountMinor > remainingMinor) {
    throw new Error('還款金額不可大於借貸剩餘金額')
  }

  const principalRemainingMinor = Math.max(0, principalMinor - Number(loan.principal_paid_minor ?? 0))
  const principalComponentMinor = Math.min(amountMinor, principalRemainingMinor)
  const interestComponentMinor = Math.max(0, amountMinor - principalComponentMinor)

  const txType = loan.direction === 'lend' ? 'income' : 'expense'
  const occurredAt = payload.paidAt ?? nowIso()
  const noteBase = payload.note ?? buildLoanPaymentNote(loan)

  let txId = null
  if (principalComponentMinor > 0) {
    txId = await addTransaction(ledgerId, {
      type: txType,
      accountId: payload.accountId,
      categoryId: null,
      amountMinor: toLoanRepaymentPrincipalMinor(loan.direction, principalComponentMinor),
      occurredAt,
      note: noteBase,
      originType: 'loan_payment',
      externalRefId: loan.id,
      idempotencyKey: idempotencyKey || undefined,
      includeInBudget: false,
      includeInAnalysis: false,
    })
  }

  let interestTxId = null
  if (interestComponentMinor > 0) {
    const interestCategoryId = await ensureLoanInterestCategory(ledgerId, txType)
    interestTxId = await addTransaction(ledgerId, {
      type: txType,
      accountId: payload.accountId,
      categoryId: interestCategoryId,
      amountMinor: toLoanRepaymentInterestMinor(loan.direction, interestComponentMinor),
      occurredAt,
      note: payload.note ?? `借貸利息：${loan.counterparty_name ?? ''}`,
      originType: 'loan_payment',
      externalRefId: loan.id,
      includeInBudget: false,
      includeInAnalysis: false,
    })
  }

  const paymentId = await createLoanPayment(ledgerId, {
    loanId: loan.id,
    accountId: payload.accountId,
    paidAt: occurredAt,
    amountMinor,
    principalComponentMinor,
    interestComponentMinor,
    generatedTxId: txId,
    generatedInterestTxId: interestTxId,
    note: payload.note ?? null,
  })

  const nextPaidMinor = paidMinor + amountMinor
  const status = nextLoanStatus(targetTotalMinor, nextPaidMinor)
  const settledAt = status === 'settled' ? nowIso() : null

  await updateLoanStatus(ledgerId, loan.id, status, { settledAt })

  return {
    loanId: loan.id,
    paymentId,
    txId,
    interestTxId,
    status,
    principalComponentMinor,
    interestComponentMinor,
    remainingMinor: Math.max(0, targetTotalMinor - nextPaidMinor),
  }
}

export async function addBatchLoanRepaymentByCounterparty(ledgerId, payload) {
  const amountMinor = validateAmountMinor(payload.amountMinor, 'repaymentAmountMinor')
  const direction = payload.direction === 'borrow' ? 'borrow' : 'lend'
  const normalizedCounterparty = normalizeLoanCounterpartyName(payload.counterpartyName)

  if (!normalizedCounterparty) {
    throw new Error('請輸入借貸對象')
  }

  if (!payload.accountId) {
    throw new Error('還款必須指定帳戶')
  }

  return withTransaction(async () => {
    const matchedLoans = sortLoansForBatchRepayment(
      (await listLoans(ledgerId))
        .map((loan) => normalizeLoanRecord(loan))
        .filter((loan) => {
          return ['active', 'partial'].includes(String(loan?.status ?? ''))
            && loan?.direction === direction
            && normalizeLoanCounterpartyName(loan?.counterparty_name) === normalizedCounterparty
            && Math.max(0, Number(loan?.remaining_minor ?? 0)) > 0
        }),
    )

    if (!matchedLoans.length) {
      throw new Error('找不到可批量處理的借貸')
    }

    const totalRemainingMinor = matchedLoans.reduce((total, loan) => {
      return total + Math.max(0, Number(loan?.remaining_minor ?? 0))
    }, 0)

    if (amountMinor > totalRemainingMinor) {
      throw new Error('批量金額不可大於對象剩餘總額')
    }

    let remainingMinor = amountMinor
    const allocations = []

    for (const loan of matchedLoans) {
      if (remainingMinor <= 0) break
      const loanRemainingMinor = Math.max(0, Number(loan?.remaining_minor ?? 0))
      if (loanRemainingMinor <= 0) continue

      const appliedMinor = Math.min(loanRemainingMinor, remainingMinor)
      const result = await addLoanRepaymentInternal(ledgerId, {
        loanId: loan.id,
        accountId: payload.accountId,
        amountMinor: appliedMinor,
        note: payload.note,
        paidAt: payload.paidAt,
      })

      allocations.push({
        loanId: loan.id,
        appliedMinor,
        status: result.status,
        remainingMinor: result.remainingMinor,
      })
      remainingMinor -= appliedMinor
    }

    return {
      direction,
      counterpartyName: payload.counterpartyName,
      totalAppliedMinor: amountMinor - remainingMinor,
      remainingMinor,
      affectedLoanCount: allocations.length,
      allocations,
    }
  })
}

export async function addBatchLoanRepaymentByLoanIds(ledgerId, payload) {
  const amountMinor = validateAmountMinor(payload.amountMinor, 'repaymentAmountMinor')
  const selectedLoanIds = Array.from(
    new Set((payload.loanIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)),
  )

  if (!selectedLoanIds.length) {
    throw new Error('請先選擇要批量處理的借貸')
  }

  if (!payload.accountId) {
    throw new Error('還款必須指定帳戶')
  }

  return withTransaction(async () => {
    const selectedLoanIdSet = new Set(selectedLoanIds)
    const matchedLoans = sortLoansForBatchRepayment(
      (await listLoans(ledgerId))
        .map((loan) => normalizeLoanRecord(loan))
        .filter((loan) => {
          return selectedLoanIdSet.has(String(loan?.id ?? ''))
            && ['active', 'partial'].includes(String(loan?.status ?? ''))
            && Math.max(0, Number(loan?.remaining_minor ?? 0)) > 0
        }),
    )

    if (!matchedLoans.length) {
      throw new Error('找不到可批量處理的借貸')
    }

    const totalRemainingMinor = matchedLoans.reduce((total, loan) => {
      return total + Math.max(0, Number(loan?.remaining_minor ?? 0))
    }, 0)

    if (amountMinor > totalRemainingMinor) {
      throw new Error('批量金額不可大於選取借貸的剩餘總額')
    }

    let remainingMinor = amountMinor
    const allocations = []

    for (const loan of matchedLoans) {
      if (remainingMinor <= 0) break
      const loanRemainingMinor = Math.max(0, Number(loan?.remaining_minor ?? 0))
      if (loanRemainingMinor <= 0) continue

      const appliedMinor = Math.min(loanRemainingMinor, remainingMinor)
      const result = await addLoanRepaymentInternal(ledgerId, {
        loanId: loan.id,
        accountId: payload.accountId,
        amountMinor: appliedMinor,
        note: payload.note,
        paidAt: payload.paidAt,
      })

      allocations.push({
        loanId: loan.id,
        appliedMinor,
        status: result.status,
        remainingMinor: result.remainingMinor,
      })
      remainingMinor -= appliedMinor
    }

    return {
      totalAppliedMinor: amountMinor - remainingMinor,
      remainingMinor,
      affectedLoanCount: allocations.length,
      allocations,
      loanIds: matchedLoans.map((loan) => loan.id),
    }
  })
}

export async function updateLoanRepayment(ledgerId, payload) {
  const amountMinor = validateAmountMinor(payload.amountMinor, 'repaymentAmountMinor')

  if (!payload.paymentId) {
    throw new Error('paymentId 為必填')
  }

  if (!payload.accountId) {
    throw new Error('還款必須指定帳戶')
  }

  return withTransaction(async () => {
    const payment = await getLoanPaymentById(ledgerId, payload.paymentId)
    if (!payment) {
      throw new Error('找不到還款紀錄')
    }

    const loan = normalizeLoanRecord(await getLoanById(ledgerId, payment.loan_id))
    if (!loan) {
      throw new Error('找不到借貸資料')
    }
    if (loan.status === 'void') {
      throw new Error('已作廢借貸不可修改還款')
    }

    const principalMinor = Number(loan.principal_minor ?? 0)
    const presetInterestMinor = Number(loan.preset_interest_minor ?? 0)
    const targetTotalMinor = Number(loan.target_total_minor ?? principalMinor)
    const paidExcludingCurrent = await sumLoanPaymentsAmountExcluding(ledgerId, loan.id, payment.id)
    const nextPaidMinor = paidExcludingCurrent + amountMinor
    if (presetInterestMinor > 0 && nextPaidMinor > targetTotalMinor) {
      throw new Error('還款金額不可大於借貸剩餘金額')
    }
    const principalPaidExcludingCurrent = Math.min(principalMinor, Math.max(0, paidExcludingCurrent))
    const principalRemainingMinor = Math.max(0, principalMinor - principalPaidExcludingCurrent)
    const principalComponentMinor = Math.min(amountMinor, principalRemainingMinor)
    const interestComponentMinor = Math.max(0, amountMinor - principalComponentMinor)

    const occurredAt = payload.paidAt ?? payment.paid_at ?? nowIso()
    const note = payload.note ?? null
    const txType = loan.direction === 'lend' ? 'income' : 'expense'
    let principalTxId = payment.generated_tx_id ? String(payment.generated_tx_id) : null
    let interestTxId = payment.generated_interest_tx_id ? String(payment.generated_interest_tx_id) : null

    const noteBase = note || buildLoanPaymentNote(loan)

    if (principalComponentMinor > 0) {
      const nextAmountMinor = loan.direction === 'lend' ? principalComponentMinor : principalComponentMinor * -1
      if (principalTxId) {
        await updateTransactionById(ledgerId, principalTxId, {
          accountId: payload.accountId,
          peerAccountId: null,
          categoryId: null,
          amountMinor: nextAmountMinor,
          occurredAt,
          note: noteBase,
          isReimbursable: false,
          reimbursementState: 'none',
          includeInBudget: false,
          includeInAnalysis: false,
        })
      } else {
        principalTxId = await addTransaction(ledgerId, {
          type: txType,
          accountId: payload.accountId,
          categoryId: null,
          amountMinor: nextAmountMinor,
          occurredAt,
          note: noteBase,
          originType: 'loan_payment',
          externalRefId: loan.id,
          includeInBudget: false,
          includeInAnalysis: false,
        })
      }
    } else if (principalTxId) {
      await softDeleteTransactionById(ledgerId, principalTxId)
      principalTxId = null
    }

    if (interestComponentMinor > 0) {
      const interestCategoryId = await ensureLoanInterestCategory(ledgerId, txType)
      const interestAmountMinor = loan.direction === 'lend' ? interestComponentMinor : interestComponentMinor * -1
      if (interestTxId) {
        await updateTransactionById(ledgerId, interestTxId, {
          accountId: payload.accountId,
          peerAccountId: null,
          categoryId: interestCategoryId,
          amountMinor: interestAmountMinor,
          occurredAt,
          note: note || `借貸利息：${loan.counterparty_name ?? ''}`,
          isReimbursable: false,
          reimbursementState: 'none',
          includeInBudget: false,
          includeInAnalysis: false,
        })
      } else {
        interestTxId = await addTransaction(ledgerId, {
          type: txType,
          accountId: payload.accountId,
          categoryId: interestCategoryId,
          amountMinor: interestAmountMinor,
          occurredAt,
          note: note || `借貸利息：${loan.counterparty_name ?? ''}`,
          originType: 'loan_payment',
          externalRefId: loan.id,
          includeInBudget: false,
          includeInAnalysis: false,
        })
      }
    } else if (interestTxId) {
      await softDeleteTransactionById(ledgerId, interestTxId)
      interestTxId = null
    }

    await updateLoanPaymentById(ledgerId, payment.id, {
      accountId: payload.accountId,
      paidAt: occurredAt,
      amountMinor,
      principalComponentMinor,
      interestComponentMinor,
      generatedTxId: principalTxId,
      generatedInterestTxId: interestTxId,
      note,
    })

    const { status, settledAt } = resolveLoanStatusAfterPaymentChange(loan, targetTotalMinor, nextPaidMinor)
    await updateLoanStatus(ledgerId, loan.id, status, { settledAt })

    return {
      paymentId: payment.id,
      txId: principalTxId,
      interestTxId,
      status,
      principalComponentMinor,
      interestComponentMinor,
      remainingMinor: Math.max(0, targetTotalMinor - nextPaidMinor),
    }
  })
}

export async function updateLoanSetupAccount(ledgerId, payload) {
  const loanId = String(payload?.loanId ?? '').trim()
  const accountId = String(payload?.accountId ?? '').trim()

  if (!loanId) {
    throw new Error('loanId 為必填')
  }

  await assertLoanTransactionAccount(ledgerId, accountId)

  return withTransaction(async () => {
    const loan = await getLoanById(ledgerId, loanId)
    if (!loan) {
      throw new Error('找不到借貸資料')
    }

    const setupTx = await getLoanSetupTransaction(ledgerId, loanId)
    if (!setupTx?.id) {
      throw new Error('找不到借貸建立交易')
    }

    await updateTransactionById(ledgerId, setupTx.id, {
      accountId,
      peerAccountId: null,
      categoryId: setupTx.category_id ?? null,
      amountMinor: Number(setupTx.amount_minor ?? 0),
      occurredAt: setupTx.occurred_at,
      note: setupTx.note ?? null,
      isReimbursable: Number(setupTx.is_reimbursable ?? 0) === 1,
      reimbursementState: setupTx.reimbursement_state ?? 'none',
      includeInBudget: Number(setupTx.include_in_budget ?? 1) === 1,
      includeInAnalysis: Number(setupTx.include_in_analysis ?? 1) === 1,
    })

    return {
      loanId,
      txId: setupTx.id,
      accountId,
    }
  })
}

export async function voidLoan(ledgerId, loanId) {
  if (!loanId) {
    throw new Error('loanId 為必填')
  }

  return withTransaction(async () => {
    const loan = await getLoanById(ledgerId, loanId)
    if (!loan) {
      throw new Error('找不到借貸資料')
    }
    if (loan.status === 'void') {
      throw new Error('借貸已作廢')
    }

    return updateLoanStatus(ledgerId, loanId, 'void', { settledAt: null })
  })
}

export async function deleteLoanRepayment(ledgerId, payload) {
  const paymentId = typeof payload === 'string' ? payload : payload?.paymentId
  if (!paymentId) {
    throw new Error('paymentId 為必填')
  }

  return withTransaction(async () => {
    const payment = await getLoanPaymentById(ledgerId, paymentId)
    if (!payment) {
      throw new Error('找不到收回紀錄')
    }

    const loan = normalizeLoanRecord(await getLoanById(ledgerId, payment.loan_id))
    if (!loan) {
      throw new Error('找不到借貸資料')
    }

    const principalTxId = String(payment.generated_tx_id ?? '').trim()
    const interestTxId = String(payment.generated_interest_tx_id ?? '').trim()

    if (principalTxId) {
      await softDeleteTransactionById(ledgerId, principalTxId)
    }
    if (interestTxId) {
      await softDeleteTransactionById(ledgerId, interestTxId)
    }

    await deleteLoanPaymentById(ledgerId, payment.id)

    const nextPaidMinor = Math.max(0, Number(loan.paid_minor ?? 0) - Math.max(0, Number(payment.amount_minor ?? 0)))
    const targetTotalMinor = Number(loan.target_total_minor ?? loan.principal_minor ?? 0)
    const { status, settledAt } = resolveLoanStatusAfterPaymentChange(loan, targetTotalMinor, nextPaidMinor)
    await updateLoanStatus(ledgerId, loan.id, status, { settledAt })

    return {
      loanId: loan.id,
      paymentId: payment.id,
      txId: principalTxId || null,
      interestTxId: interestTxId || null,
      status,
      remainingMinor: Math.max(0, targetTotalMinor - nextPaidMinor),
    }
  })
}

export async function deleteLoanRepaymentByTransactionId(ledgerId, txId) {
  if (!txId) return null

  const payment = await getLoanPaymentByGeneratedTransactionId(ledgerId, txId)
  if (!payment?.id) return null
  return deleteLoanRepayment(ledgerId, payment.id)
}

export async function updateCompletedLoanPrincipal(ledgerId, payload) {
  const principalMinor = validateAmountMinor(payload.principalMinor, 'principalMinor')
  if (!payload.loanId) {
    throw new Error('loanId 為必填')
  }

  return withTransaction(async () => {
    const rawLoan = await getLoanById(ledgerId, payload.loanId)
    if (!rawLoan) {
      throw new Error('找不到借貸資料')
    }
    const loan = normalizeLoanRecord(rawLoan)
    if (!['settled', 'void'].includes(loan.status)) {
      throw new Error('僅已完成借貸可變更本金')
    }

    await updateLoanPrincipalById(ledgerId, loan.id, principalMinor)

    const payments = await listLoanPayments(ledgerId, loan.id)
    const chronological = payments
      .slice()
      .sort((a, b) => String(a.paid_at ?? '').localeCompare(String(b.paid_at ?? '')) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    const txType = loan.direction === 'lend' ? 'income' : 'expense'
    let principalRemainingMinor = principalMinor
    let paidMinor = 0

    for (const payment of chronological) {
      const paymentAmountMinor = Math.max(0, Number(payment.amount_minor ?? 0))
      paidMinor += paymentAmountMinor
      const principalComponentMinor = Math.min(paymentAmountMinor, Math.max(0, principalRemainingMinor))
      const interestComponentMinor = Math.max(0, paymentAmountMinor - principalComponentMinor)
      principalRemainingMinor = Math.max(0, principalRemainingMinor - principalComponentMinor)
      let principalTxId = payment.generated_tx_id ? String(payment.generated_tx_id) : null
      let interestTxId = payment.generated_interest_tx_id ? String(payment.generated_interest_tx_id) : null

      if (principalComponentMinor > 0) {
        const amountMinor = loan.direction === 'lend' ? principalComponentMinor : principalComponentMinor * -1
        if (principalTxId) {
          await updateTransactionById(ledgerId, principalTxId, {
            accountId: payment.account_id,
            peerAccountId: null,
            categoryId: null,
            amountMinor,
            occurredAt: payment.paid_at,
            note: payment.note || buildLoanPaymentNote(loan),
            isReimbursable: false,
            reimbursementState: 'none',
            includeInBudget: false,
            includeInAnalysis: false,
          })
        } else {
          principalTxId = await addTransaction(ledgerId, {
            type: txType,
            accountId: payment.account_id,
            categoryId: null,
            amountMinor,
            occurredAt: payment.paid_at,
            note: payment.note || buildLoanPaymentNote(loan),
            originType: 'loan_payment',
            externalRefId: loan.id,
            includeInBudget: false,
            includeInAnalysis: false,
          })
        }
      } else if (principalTxId) {
        await softDeleteTransactionById(ledgerId, principalTxId)
        principalTxId = null
      }

      if (interestComponentMinor > 0) {
        const interestCategoryId = await ensureLoanInterestCategory(ledgerId, txType)
        const amountMinor = loan.direction === 'lend' ? interestComponentMinor : interestComponentMinor * -1
        if (interestTxId) {
          await updateTransactionById(ledgerId, interestTxId, {
            accountId: payment.account_id,
            peerAccountId: null,
            categoryId: interestCategoryId,
            amountMinor,
            occurredAt: payment.paid_at,
            note: payment.note || `借貸利息：${loan.counterparty_name ?? ''}`,
            isReimbursable: false,
            reimbursementState: 'none',
            includeInBudget: false,
            includeInAnalysis: false,
          })
        } else {
          interestTxId = await addTransaction(ledgerId, {
            type: txType,
            accountId: payment.account_id,
            categoryId: interestCategoryId,
            amountMinor,
            occurredAt: payment.paid_at,
            note: payment.note || `借貸利息：${loan.counterparty_name ?? ''}`,
            originType: 'loan_payment',
            externalRefId: loan.id,
            includeInBudget: false,
            includeInAnalysis: false,
          })
        }
      } else if (interestTxId) {
        await softDeleteTransactionById(ledgerId, interestTxId)
        interestTxId = null
      }

      await updateLoanPaymentById(ledgerId, payment.id, {
        accountId: payment.account_id,
        paidAt: payment.paid_at,
        amountMinor: paymentAmountMinor,
        principalComponentMinor,
        interestComponentMinor,
        generatedTxId: principalTxId,
        generatedInterestTxId: interestTxId,
        note: payment.note,
      })
    }

    const updatedLoan = normalizeLoanRecord(await getLoanById(ledgerId, loan.id))
    if (!updatedLoan) throw new Error('找不到借貸資料')
    if (updatedLoan.status === 'void') {
      return { loanId: loan.id, principalMinor }
    }

    const targetTotalMinor = Number(updatedLoan.target_total_minor ?? principalMinor)
    const nextStatus = nextLoanStatus(targetTotalMinor, paidMinor)
    await updateLoanStatus(ledgerId, loan.id, nextStatus, {
      settledAt: nextStatus === 'settled' ? nowIso() : null,
    })
    return { loanId: loan.id, principalMinor, status: nextStatus }
  })
}

export async function restoreLoan(ledgerId, loanId) {
  if (!loanId) {
    throw new Error('loanId 為必填')
  }

  const loan = await getLoanById(ledgerId, loanId)
  if (!loan) {
    throw new Error('找不到借貸資料')
  }
  if (loan.status !== 'void') {
    throw new Error('僅作廢借貸可恢復')
  }

  return updateLoanStatus(ledgerId, loanId, 'active', { settledAt: null })
}

export async function deleteVoidedLoan(ledgerId, loanId) {
  return deleteLoan(ledgerId, loanId)
}

export async function deleteLoan(ledgerId, loanId) {
  if (!loanId) {
    throw new Error('loanId 為必填')
  }

  return withTransaction(async () => {
    const loan = await getLoanById(ledgerId, loanId)
    if (!loan) {
      throw new Error('找不到借貸資料')
    }

    await softDeleteTransactionsByOriginRef(ledgerId, 'loan_payment', loanId)
    await deleteLoanPaymentsByLoanId(ledgerId, loanId)
    await softDeleteLoanById(ledgerId, loanId)
    return { deleted: true, loanId }
  })
}

export async function deleteLoanByExternalRefId(ledgerId, externalRefId) {
  if (!externalRefId) return null
  const loan = await getLoanById(ledgerId, externalRefId)
  if (!loan) return null
  return deleteLoan(ledgerId, externalRefId)
}

export async function getLoanDetail(ledgerId, loanId) {
  const loan = normalizeLoanRecord(await getLoanById(ledgerId, loanId))
  if (!loan) {
    throw new Error('找不到借貸資料')
  }

  const payments = await listLoanPayments(ledgerId, loanId)
  return { loan, payments }
}
