const INDENT_UNIT = "  "
const BULLET = "- "

export type IndentEdit = {
  text: string
  cursor: number
}

type LineParse = {
  level: number
  content: string
  prefixLength: number
}

type LineInfo = {
  lineStart: number
  lineEnd: number
  line: string
}

function prefixFor(level: number): string {
  if (level <= 0) return ""
  return INDENT_UNIT.repeat(level) + BULLET
}

function formatLine(level: number, content: string): string {
  return prefixFor(Math.max(0, level)) + content
}

function parseLine(line: string): LineParse {
  let i = 0
  let width = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === " ") {
      width += 1
      i += 1
    } else if (ch === "\t") {
      width += INDENT_UNIT.length
      i += 1
    } else {
      break
    }
  }
  const level = Math.floor(width / INDENT_UNIT.length)
  let content = line.slice(i)
  let prefixLength = i
  if (level > 0 && content.startsWith(BULLET)) {
    prefixLength += BULLET.length
    content = content.slice(BULLET.length)
  }
  return { level, content, prefixLength }
}

function getLineInfo(text: string, cursor: number): LineInfo {
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor) - 1) + 1
  const nl = text.indexOf("\n", cursor)
  const lineEnd = nl === -1 ? text.length : nl
  return { lineStart, lineEnd, line: text.slice(lineStart, lineEnd) }
}

function previousLineLevel(text: string, lineStart: number): number {
  if (lineStart <= 0) return 0
  const prevEnd = lineStart - 1
  const prevStart = text.lastIndexOf("\n", prevEnd - 1) + 1
  return parseLine(text.slice(prevStart, prevEnd)).level
}

function replaceLine(
  text: string,
  info: LineInfo,
  parsed: LineParse,
  nextLevel: number,
  cursor: number,
): IndentEdit {
  const nextLine = formatLine(nextLevel, parsed.content)
  const contentOffset = Math.max(0, cursor - info.lineStart - parsed.prefixLength)
  return {
    text: text.slice(0, info.lineStart) + nextLine + text.slice(info.lineEnd),
    cursor: info.lineStart + prefixFor(nextLevel).length + contentOffset,
  }
}

export function indentLine(text: string, cursor: number): IndentEdit | null {
  const info = getLineInfo(text, cursor)
  const parsed = parseLine(info.line)
  const maxLevel = previousLineLevel(text, info.lineStart) + 1
  if (parsed.level >= maxLevel) return null
  return replaceLine(text, info, parsed, parsed.level + 1, cursor)
}

export function outdentLine(text: string, cursor: number): IndentEdit | null {
  const info = getLineInfo(text, cursor)
  const parsed = parseLine(info.line)
  if (parsed.level <= 0) return null
  return replaceLine(text, info, parsed, parsed.level - 1, cursor)
}

export function insertInheritedNewline(text: string, cursor: number): IndentEdit {
  const info = getLineInfo(text, cursor)
  const parsed = parseLine(info.line)
  const contentStart = info.lineStart + parsed.prefixLength
  const caretInContent = Math.max(0, cursor - contentStart)
  const leftLine = formatLine(parsed.level, parsed.content.slice(0, caretInContent))
  const rightLine = formatLine(parsed.level, parsed.content.slice(caretInContent))
  return {
    text: text.slice(0, info.lineStart) + leftLine + "\n" + rightLine + text.slice(info.lineEnd),
    cursor: info.lineStart + leftLine.length + 1 + prefixFor(parsed.level).length,
  }
}

export function backspaceIndent(text: string, cursor: number): IndentEdit | null {
  const info = getLineInfo(text, cursor)
  const parsed = parseLine(info.line)
  if (parsed.level <= 0) return null
  const contentStart = info.lineStart + parsed.prefixLength
  if (cursor <= info.lineStart || cursor > contentStart) return null
  return replaceLine(text, info, parsed, parsed.level - 1, contentStart)
}

export function applyTaskIndentKey(opts: {
  text: string
  selectionStart: number
  selectionEnd: number
  key: string
  shiftKey: boolean
  altKey: boolean
  metaOrCtrl: boolean
}): (IndentEdit & { preventDefault: true }) | null {
  if (opts.metaOrCtrl || opts.altKey) return null

  if (opts.key === "Tab") {
    const cursor = opts.selectionStart
    const edit = opts.shiftKey
      ? outdentLine(opts.text, cursor)
      : indentLine(opts.text, cursor)
    return {
      text: edit?.text ?? opts.text,
      cursor: edit?.cursor ?? cursor,
      preventDefault: true,
    }
  }

  if (opts.key === "Enter" && opts.shiftKey) {
    let text = opts.text
    let cursor = opts.selectionStart
    if (opts.selectionStart !== opts.selectionEnd) {
      const from = Math.min(opts.selectionStart, opts.selectionEnd)
      const to = Math.max(opts.selectionStart, opts.selectionEnd)
      text = text.slice(0, from) + text.slice(to)
      cursor = from
    }
    return { ...insertInheritedNewline(text, cursor), preventDefault: true }
  }

  if (
    opts.key === "Backspace" &&
    !opts.shiftKey &&
    opts.selectionStart === opts.selectionEnd
  ) {
    const edit = backspaceIndent(opts.text, opts.selectionStart)
    if (!edit) return null
    return { ...edit, preventDefault: true }
  }

  return null
}

/** Prefix `- ` on the first line only so nested indent lines stay intact. */
export function formatTaskForCopy(text: string, blocker?: string | null): string {
  const trimmed = text.replace(/\s+$/, "")
  if (!trimmed) return ""
  const lines = trimmed.split("\n")
  const formatted = [`- ${lines[0] ?? ""}`, ...lines.slice(1)].join("\n")
  return blocker ? `${formatted} [blocker]` : formatted
}
