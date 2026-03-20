function compactText(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

const LOAN_COUNTERPARTY_STOPWORDS = new Set([
  '出',
  '入',
  '借',
  '還',
  '还',
  '借出',
  '借入',
  '借款',
  '借錢',
  '借钱',
  '還款',
  '还款',
  '還錢',
  '还钱',
  '歸還',
  '归还',
  '收回',
  '支出',
  '收入',
  '付款',
  '收款',
  '轉帳',
  '转账',
  '金額',
  '金额',
  '款項',
  '款项',
].map((item) => compactText(item)))

const LOAN_COUNTERPARTY_TIME_WORDS = new Set([
  '昨天',
  '今天',
  '明天',
  '前天',
  '剛剛',
  '刚刚',
  '下午',
  '上午',
  '晚上',
  '早上',
  'yesterday',
  'today',
  'tomorrow',
  'afternoon',
  'morning',
  'evening',
  'night',
  '昨日',
  '今日',
  '明日',
].map((item) => compactText(item)))

function isLikelyAmountLikeCounterparty(rawValue) {
  const normalized = compactText(String(rawValue ?? '').replace(/[,，]/g, ''))
  if (!normalized) return false
  return /^(?:nt\$?|ntd|twd|us\$|usd|\$|¥)?\d+(?:\.\d+)?(?:k|w|萬|万|千|百|元(?:整)?|塊|块|美元|美金|台幣|臺幣|日圓|日元)?$/.test(normalized)
}

export function normalizeLoanCounterpartyName(rawName) {
  let name = String(rawName ?? '').trim()
  if (!name) return ''

  name = name.replace(
    /^(?:(?:nt\$?|ntd|twd|us\$|usd|\$|¥)\s*)?\d[\d,]*(?:\.\d+)?(?:k|w|萬|万|千|百|元(?:整)?|塊|块|美元|美金|台幣|臺幣|日圓|日元)?\s*(?:給|借給|還給|归还给)?\s*/i,
    '',
  )
  name = name.replace(/^(?:借給|借出給|借了給|借款給|還給|还给|收回)\s*/i, '')
  name = name.replace(/^(?:[給跟向對把將]+|to\s+|from\s+)/i, '')
  name = name.replace(
    /\s*(?:給|借給|還給|归还给)?\s*(?:(?:nt\$?|ntd|twd|us\$|usd|\$|¥)\s*)?\d[\d,]*(?:\.\d+)?(?:k|w|萬|万|千|百|元(?:整)?|塊|块|美元|美金|台幣|臺幣|日圓|日元)?$/i,
    '',
  )
  name = name.replace(/[的之]+$/g, '')
  name = name.replace(/(借款|欠款|還款|还款|款項|款项|款|錢|钱|loan|repay|payment|money)$/gi, '')
  name = name.replace(/^[,，。:：;；]+|[,，。:：;；]+$/g, '')
  name = name.trim()
  if (!name) return ''

  if (name.length > 24) {
    name = name.slice(0, 24).trim()
  }
  if (!name) return ''
  if (!/[A-Za-z\u3040-\u30ff\u3400-\u9fff]/.test(name)) return ''
  if (isLikelyAmountLikeCounterparty(name)) return ''

  const compactName = compactText(name)
  if (!compactName) return ''
  if (LOAN_COUNTERPARTY_TIME_WORDS.has(compactName)) return ''
  if (LOAN_COUNTERPARTY_STOPWORDS.has(compactName)) return ''

  return name
}
