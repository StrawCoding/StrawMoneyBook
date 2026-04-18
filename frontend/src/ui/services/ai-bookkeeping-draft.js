export function resolveAiBookkeepingNoteValue(currentNote, parsedNote, options = {}) {
  const nextNote = String(parsedNote ?? '').trim()
  if (nextNote) return nextNote

  if (options.preserveCurrentWhenParsedEmpty) {
    return String(currentNote ?? '').trim()
  }

  return ''
}
