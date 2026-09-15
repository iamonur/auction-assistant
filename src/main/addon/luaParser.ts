/**
 * Parses a Lua table literal back into a plain JS value — the read
 * direction for SavedVariables, complementing luaSerializer.ts's write
 * direction. Needed for anything the *addon* writes and the desktop app
 * reads back (the AH scan results — see ahScanImport.ts), as opposed to
 * the export.ts direction, which only ever writes.
 *
 * Why a hand-written parser instead of assuming our own luaSerializer's
 * exact formatting: the file being read here was last rewritten by WoW's
 * own client when the player logged out, not by this app — the client's
 * built-in table serializer pretty-prints with its own whitespace,
 * indentation, and trailing commas, so this has to tolerate arbitrary Lua
 * table syntax, not just mirror what encodeLuaValue happens to produce.
 */

class LuaParseError extends Error {}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

function isIdentChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch)
}

class Parser {
  private pos = 0
  constructor(private readonly text: string) {}

  private skipWhitespaceAndComments(): void {
    for (;;) {
      const ch = this.text[this.pos]
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.pos++
        continue
      }
      if (ch === '-' && this.text[this.pos + 1] === '-') {
        this.pos += 2
        if (this.text[this.pos] === '[' && this.text[this.pos + 1] === '[') {
          const end = this.text.indexOf(']]', this.pos + 2)
          this.pos = end === -1 ? this.text.length : end + 2
        } else {
          const end = this.text.indexOf('\n', this.pos)
          this.pos = end === -1 ? this.text.length : end
        }
        continue
      }
      return
    }
  }

  private peek(): string {
    return this.text[this.pos]
  }

  private expect(char: string): void {
    if (this.text[this.pos] !== char) {
      throw new LuaParseError(`Expected "${char}" at position ${this.pos}, got "${this.text.slice(this.pos, this.pos + 20)}"`)
    }
    this.pos++
  }

  private parseString(): string {
    this.expect('"')
    let result = ''
    while (this.text[this.pos] !== '"') {
      if (this.pos >= this.text.length) throw new LuaParseError('Unterminated string literal')
      const ch = this.text[this.pos]
      if (ch === '\\') {
        const next = this.text[this.pos + 1]
        if (next === 'n') result += '\n'
        else if (next === 'r') result += '\r'
        else if (next === 't') result += '\t'
        else result += next // \\ -> \, \" -> ", and a defensive fallback for anything else
        this.pos += 2
        continue
      }
      result += ch
      this.pos++
    }
    this.pos++ // closing quote
    return result
  }

  private parseNumber(): number {
    const match = /-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.text.slice(this.pos))
    if (!match || match.index !== 0) throw new LuaParseError(`Expected a number at position ${this.pos}`)
    this.pos += match[0].length
    return Number(match[0])
  }

  private parseTable(): unknown {
    this.expect('{')
    const object: Record<string, unknown> = {}
    const array: unknown[] = []
    let isObject = false

    for (;;) {
      this.skipWhitespaceAndComments()
      if (this.peek() === '}') {
        this.pos++
        break
      }

      if (this.peek() === '[') {
        isObject = true
        this.pos++
        this.skipWhitespaceAndComments()
        const key = this.peek() === '"' ? this.parseString() : String(this.parseNumber())
        this.skipWhitespaceAndComments()
        this.expect(']')
        this.skipWhitespaceAndComments()
        this.expect('=')
        this.skipWhitespaceAndComments()
        object[key] = this.parseValue()
      } else if (/[A-Za-z_]/.test(this.peek())) {
        // Bare identifier key sugar (e.g. `schemaVersion = 1`), which WoW's
        // own serializer doesn't emit but Lua syntax allows and our own
        // hand-written fixtures/tests may use for readability.
        isObject = true
        let ident = ''
        while (isIdentChar(this.peek())) {
          ident += this.peek()
          this.pos++
        }
        this.skipWhitespaceAndComments()
        this.expect('=')
        this.skipWhitespaceAndComments()
        object[ident] = this.parseValue()
      } else {
        array.push(this.parseValue())
      }

      this.skipWhitespaceAndComments()
      if (this.peek() === ',') {
        this.pos++
        continue
      }
      this.skipWhitespaceAndComments()
      if (this.peek() === '}') {
        this.pos++
        break
      }
      throw new LuaParseError(`Expected "," or "}" at position ${this.pos}`)
    }

    return isObject ? object : array
  }

  parseValue(): unknown {
    this.skipWhitespaceAndComments()
    const ch = this.peek()
    if (ch === '"') return this.parseString()
    if (ch === '{') return this.parseTable()
    if (ch === '-' || isDigit(ch)) return this.parseNumber()
    if (this.text.startsWith('true', this.pos)) {
      this.pos += 4
      return true
    }
    if (this.text.startsWith('false', this.pos)) {
      this.pos += 5
      return false
    }
    if (this.text.startsWith('nil', this.pos)) {
      this.pos += 3
      return null
    }
    throw new LuaParseError(`Unexpected character "${ch}" at position ${this.pos}`)
  }

  setPos(pos: number): void {
    this.pos = pos
  }
}

/**
 * Finds `globalName = <value>` anywhere in a Lua source file (a
 * SavedVariables file can declare several globals back to back) and
 * parses just that value. Returns undefined if the global isn't present
 * — a legitimate state (e.g. the addon has never completed a scan yet),
 * not a parse error.
 */
export function decodeLuaSavedVariable(source: string, globalName: string): unknown {
  const marker = new RegExp(`(?:^|[^A-Za-z0-9_])${globalName}\\s*=`)
  const match = marker.exec(source)
  if (!match) return undefined

  const assignIndex = match.index + match[0].length - 1 // position of the "="
  const parser = new Parser(source)
  parser.setPos(assignIndex + 1)
  return parser.parseValue()
}
