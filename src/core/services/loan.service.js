import { withTransaction } from '@/core/db/sqlite'
import { nowIso } from '@/core/utils/id'
import { ensureCounterpartyByName } from '@/core/repositories/counterparty.repo'
import {
  countLoans,
  createLoan,
  createLoanPayment,
  getLoanById,
  listLoanPayments,
  listLoans,
  sumLoanPayments,
  updateLoanStatus,
} from '@/core/repositories/loan.repo'
import { addTransaction } from '@/core/repositories/transaction.repo'
import { assertCanCreateLoan } from '@/core/services/membership.service'

function validateDirection(direction) {
  if (!['lend', 'borrow'].includes(direction)) {
    throw new Error('direction 僅可為 lend 或 borrow')
  }
}

function validateAmountMinor(amountMinor, fieldName = 'amountMinor') {
  const amount = Number(amountMinor)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} 必須為大於 0 的整數`) 
  }
  return Math.round(amount)
}

function nextLoanStatus(principalMinor, paidMinor) {
  if (paidMinor <= 0) return 'active'
  if (paidMinor >= principalMinor) return 'settled'
  return 'partial'
}

export async function loadLoanDashboard(ledgerId) {
  const loans = await listLoans(ledgerId)
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
      startDate: payload.startDate,
      dueDate: payload.dueDate ?? null,
      note: payload.note ?? null,
      status: 'active',
    })

    const txType = payload.direction === 'lend' ? 'expense' : 'income'
    const amountMinor = payload.direction === 'lend' ? principalMinor * -1 : principalMinor
    await addTransaction(ledgerId, {
      type: txType,
      accountId: payload.accountId,
      categoryId: payload.categoryId ?? null,
      amountMinor,
      occurredAt: payload.occurredAt ?? nowIso(),
      note: payload.note ?? `借貸建立：${payload.counterpartyName}`,
      originType: 'loan_payment',
      externalRefId: loan.id,
    })

    return loan
  })
}

export async function addLoanRepayment(ledgerId, payload) {
  const amountMinor = validateAmountMinor(payload.amountMinor, 'repaymentAmountMinor')

  if (!payload.loanId) {
    throw new Error('loanId 為必填')
  }

  if (!payload.accountId) {
    throw new Error('還款必須指定帳戶')
  }

  return withTransaction(async () => {
    const loan = await getLoanById(ledgerId, payload.loanId)
    if (!loan) {
      throw new Error('找不到借貸資料')
    }

    if (loan.status === 'void') {
      throw new Error('已作廢借貸不可還款')
    }

    const paidMinor = await sumLoanPayments(ledgerId, payload.loanId)
    const principalMinor = Number(loan.principal_minor)
    const remainingMinor = principalMinor - paidMinor

    if (remainingMinor <= 0) {
      throw new Error('此借貸已結清')
    }

    if (amountMinor > remainingMinor) {
      throw new Error(`還款金額不可超過剩餘本金 ${remainingMinor}`)
    }

    const txType = loan.direction === 'lend' ? 'income' : 'expense'
    const txAmountMinor = loan.direction === 'lend' ? amountMinor : amountMinor * -1

    const txId = await addTransaction(ledgerId, {
      type: txType,
      accountId: payload.accountId,
      categoryId: payload.categoryId ?? null,
      amountMinor: txAmountMinor,
      occurredAt: payload.paidAt ?? nowIso(),
      note: payload.note ?? `借貸還款：${loan.counterparty_name ?? ''}`,
      originType: 'loan_payment',
      externalRefId: loan.id,
    })

    const paymentId = await createLoanPayment(ledgerId, {
      loanId: loan.id,
      accountId: payload.accountId,
      paidAt: payload.paidAt ?? nowIso(),
      amountMinor,
      generatedTxId: txId,
      note: payload.note ?? null,
    })

    const nextPaidMinor = paidMinor + amountMinor
    const status = nextLoanStatus(principalMinor, nextPaidMinor)
    const settledAt = status === 'settled' ? nowIso() : null

    await updateLoanStatus(ledgerId, loan.id, status, { settledAt })

    return {
      paymentId,
      txId,
      status,
      remainingMinor: principalMinor - nextPaidMinor,
    }
  })
}

export async function voidLoan(ledgerId, loanId) {
  if (!loanId) {
    throw new Error('loanId 為必填')
  }

  const paidMinor = await sumLoanPayments(ledgerId, loanId)
  if (paidMinor > 0) {
    throw new Error('已有還款紀錄，無法作廢')
  }

  return updateLoanStatus(ledgerId, loanId, 'void', { settledAt: null })
}

export async function getLoanDetail(ledgerId, loanId) {
  const loan = await getLoanById(ledgerId, loanId)
  if (!loan) {
    throw new Error('找不到借貸資料')
  }

  const payments = await listLoanPayments(ledgerId, loanId)
  return { loan, payments }
}
