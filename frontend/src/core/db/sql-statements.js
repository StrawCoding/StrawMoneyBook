export function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let token = ''
  let lastToken = ''
  let isTriggerStatement = false
  let inLineComment = false
  let inBlockComment = false
  let quoteChar = ''

  const flushToken = () => {
    if (!token) return
    const upper = token.toUpperCase()
    if (upper === 'TRIGGER' && current.toUpperCase().includes('CREATE')) {
      isTriggerStatement = true
    }
    lastToken = upper
    token = ''
  }

  const flushStatement = () => {
    const trimmed = current.trim()
    if (trimmed) {
      statements.push(trimmed)
    }
    current = ''
    token = ''
    lastToken = ''
    isTriggerStatement = false
    inLineComment = false
    inBlockComment = false
    quoteChar = ''
  }

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const nextChar = sql[index + 1]
    current += char

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        current += nextChar
        index += 1
        inBlockComment = false
      }
      continue
    }

    if (quoteChar) {
      if (char === quoteChar) {
        const escapedSingleQuote = quoteChar === "'" && nextChar === "'"
        if (escapedSingleQuote) {
          current += nextChar
          index += 1
        } else {
          quoteChar = ''
        }
      }
      continue
    }

    if (char === '-' && nextChar === '-') {
      current += nextChar
      index += 1
      flushToken()
      inLineComment = true
      continue
    }

    if (char === '/' && nextChar === '*') {
      current += nextChar
      index += 1
      flushToken()
      inBlockComment = true
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      flushToken()
      quoteChar = char
      continue
    }

    if (/[A-Za-z0-9_]/.test(char)) {
      token += char
    } else {
      flushToken()
    }

    if (char === ';') {
      if (!isTriggerStatement || lastToken === 'END') {
        flushStatement()
      }
    }
  }

  flushToken()
  flushStatement()

  return statements
}
