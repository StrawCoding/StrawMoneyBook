/**
 * Split SQL into executable statements.
 *
 * SQLite only accepts `--` line comments and C-style block comments.
 * MySQL/shell `#` line comments are stripped here so Android Capacitor
 * sqlite executeSet never sees `unrecognized token: "#"`.
 */
export function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let token = ''
  let lastToken = ''
  let isTriggerStatement = false
  let inLineComment = false
  /** When true, hash (#) comment body is omitted from the statement text. */
  let stripLineComment = false
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
    stripLineComment = false
    inBlockComment = false
    quoteChar = ''
  }

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const nextChar = sql[index + 1]

    if (inLineComment) {
      if (char === '\n') {
        if (!stripLineComment) {
          current += char
        }
        inLineComment = false
        stripLineComment = false
      } else if (!stripLineComment) {
        current += char
      }
      continue
    }

    if (inBlockComment) {
      current += char
      if (char === '*' && nextChar === '/') {
        current += nextChar
        index += 1
        inBlockComment = false
      }
      continue
    }

    if (quoteChar) {
      current += char
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
      current += char
      current += nextChar
      index += 1
      flushToken()
      inLineComment = true
      stripLineComment = false
      continue
    }

    // MySQL/shell hash comments are not valid SQLite — strip them entirely.
    if (char === '#') {
      flushToken()
      inLineComment = true
      stripLineComment = true
      continue
    }

    if (char === '/' && nextChar === '*') {
      current += char
      current += nextChar
      index += 1
      flushToken()
      inBlockComment = true
      continue
    }

    current += char

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
