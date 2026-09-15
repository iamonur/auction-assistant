/**
 * Encodes a plain JS value as Lua source suitable for a WoW addon's
 * SavedVariables file — the inverse of the hand-written Lua-table parsers
 * built for the pfQuest zone-enrichment work (scripts/data-extraction/).
 * Only the value shapes SavedVariables actually needs are supported:
 * strings, finite numbers, booleans, null (encoded as Lua's nil-equivalent
 * omission — see note below), plain objects (-> Lua tables with quoted
 * string keys), and arrays/number-keyed maps (-> Lua tables with numeric
 * keys). No functions, no cyclic references.
 */
export type LuaEncodable =
  | string
  | number
  | boolean
  | null
  | undefined
  | LuaEncodable[]
  | { [key: string]: LuaEncodable }
  | { [key: number]: LuaEncodable }

function encodeString(value: string): string {
  // Lua's own escaping rules for a double-quoted short string literal.
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

function encodeKey(key: string): string {
  // A numeric-looking key (e.g. an item id used as a table index) is
  // written as [123] = ...; anything else as ["key"] = ... — always the
  // bracketed form, never Lua's bare-identifier sugar, so keys that
  // aren't valid Lua identifiers (leading digits, punctuation) can't
  // produce invalid syntax.
  return /^-?\d+$/.test(key) ? `[${key}]` : `[${encodeString(key)}]`
}

export function encodeLuaValue(value: LuaEncodable): string {
  if (value === null || value === undefined) return 'nil'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cannot encode non-finite number as Lua: ${value}`)
    return String(value)
  }
  if (typeof value === 'string') return encodeString(value)

  if (Array.isArray(value)) {
    const items = value.map((item) => encodeLuaValue(item))
    return `{${items.join(',')}}`
  }

  const entries = Object.entries(value).map(([key, val]) => `${encodeKey(key)}=${encodeLuaValue(val)}`)
  return `{${entries.join(',')}}`
}

/** Wraps an encoded value as `GlobalName = { ... }\n`, the shape a SavedVariables file's top level needs. */
export function encodeLuaSavedVariable(globalName: string, value: LuaEncodable): string {
  return `${globalName} = ${encodeLuaValue(value)}\n`
}
