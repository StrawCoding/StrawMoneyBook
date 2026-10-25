/**
 * Map backend / service errors from manual bookkeeping submits to user-facing i18n.
 */

export function isUnsetZeroBookkeepingAmount({
  settledAmountMinorRaw = 0,
  baseAmountMinor = 0,
  appliedAddonItems = [],
} = {}) {
  return (
    Number(settledAmountMinorRaw) === 0
    && Number(baseAmountMinor) <= 0
    && !appliedAddonItems.some((item) => Number(item?.deltaMajor) > 0)
  )
}

export function resolveBookkeepingSubmitErrorMessage(error, t) {
  const code = String(error?.code ?? '').trim()
  const message = String(error?.message ?? '').trim()

  if (code === 'CLOSED_STATEMENT_POSTING_FORBIDDEN') {
    return t(
      'quick_add.error.credit_closed_statement',
      '此日期對應的信用卡帳單已關帳，無法記帳。請改選其他日期。',
    )
  }

  const amountMustGtZero = t('quick_add.error.amount_required', '請輸入有效金額（需大於 0）')
  if (message.includes('金額必須大於 0') || message.includes('amount must be greater than 0') || message.includes(amountMustGtZero)) {
    return amountMustGtZero
  }

  const creditAccrualForbidden = t('error.credit_accrual_forbidden', '禁止建立信用卡應計')
  const legacyCreditAccrual = t(
    'error.legacy_credit_accrual_account',
    '帳本內仍有舊版「信用卡應計」帳戶，請至資產管理移除或重新命名後再記帳。',
  )
  if (message.includes('禁止建立信用卡應計') || message.includes('virtual accrual') || message.includes(creditAccrualForbidden)) {
    return creditAccrualForbidden
  }
  if (message.includes('帳本內仍有舊版') || message.includes(legacyCreditAccrual)) {
    return legacyCreditAccrual
  }

  const savingsJarDirect = t(
    'quick_add.error.savings_jar_direct',
    '存錢罐僅支援存入與提取，請使用存錢罐功能頁。',
  )
  if (message.includes('存錢罐僅支援') || message.includes(savingsJarDirect)) {
    return savingsJarDirect
  }

  const creditAccountRequired = t('quick_add.error.credit_account_required', '請選擇信用卡帳戶')
  if (message.includes('請選擇信用卡帳戶') || message.includes(creditAccountRequired)) {
    return creditAccountRequired
  }

  return message || t('quick_add.toast.create_failed')
}
