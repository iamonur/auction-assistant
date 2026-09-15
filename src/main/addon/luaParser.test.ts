import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { encodeLuaSavedVariable } from './luaSerializer'
import { decodeLuaSavedVariable } from './luaParser'

/** True if a `lua` interpreter is on PATH. */
function hasLuaInterpreter(): boolean {
  try {
    execFileSync('lua', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('decodeLuaSavedVariable', () => {
  it('round-trips through our own encoder for a nested value', () => {
    const value = {
      schemaVersion: 1,
      scannedAt: '2026-01-01T12:00:00Z',
      items: {
        19019: { p: 500000, v: 3 },
        100: { p: 250, v: 0 }
      }
    }
    const source = encodeLuaSavedVariable('AuctionAssistantScan', value)

    expect(decodeLuaSavedVariable(source, 'AuctionAssistantScan')).toEqual({
      schemaVersion: 1,
      scannedAt: '2026-01-01T12:00:00Z',
      items: {
        '19019': { p: 500000, v: 3 },
        '100': { p: 250, v: 0 }
      }
    })
  })

  it('returns undefined when the global is not present in the source', () => {
    const source = encodeLuaSavedVariable('SomeOtherGlobal', { a: 1 })
    expect(decodeLuaSavedVariable(source, 'AuctionAssistantScan')).toBeUndefined()
  })

  it('finds the right global among several declared in the same file, without partial-name collisions', () => {
    const source = [
      encodeLuaSavedVariable('AuctionAssistantPrices', { a: 1 }),
      encodeLuaSavedVariable('AuctionAssistantScan', { b: 2 }),
      encodeLuaSavedVariable('AuctionAssistantScanExtra', { c: 3 })
    ].join('')

    expect(decodeLuaSavedVariable(source, 'AuctionAssistantScan')).toEqual({ b: 2 })
    expect(decodeLuaSavedVariable(source, 'AuctionAssistantPrices')).toEqual({ a: 1 })
    expect(decodeLuaSavedVariable(source, 'AuctionAssistantScanExtra')).toEqual({ c: 3 })
  })

  // WoW's own client rewrites SavedVariables in its own pretty-printed
  // style (tabs, one entry per line, a trailing comma after the last
  // entry) whenever the player logs out — not our compact single-line
  // format. This fixture matches that style by hand to make sure the
  // parser doesn't secretly depend on our own encoder's exact formatting.
  const wowStyleFixture = `AuctionAssistantScan = {
\t["schemaVersion"] = 1,
\t["scannedAt"] = "2026-01-01T12:00:00Z",
\t["items"] = {
\t\t[19019] = {
\t\t\t["p"] = 500000,
\t\t\t["v"] = 3,
\t\t},
\t\t[100] = {
\t\t\t["p"] = 250,
\t\t\t["v"] = 0,
\t\t},
\t},
}
`

  it('parses a WoW-client-style pretty-printed table (tabs, newlines, trailing commas)', () => {
    expect(decodeLuaSavedVariable(wowStyleFixture, 'AuctionAssistantScan')).toEqual({
      schemaVersion: 1,
      scannedAt: '2026-01-01T12:00:00Z',
      items: {
        '19019': { p: 500000, v: 3 },
        '100': { p: 250, v: 0 }
      }
    })
  })

  it.skipIf(!hasLuaInterpreter())('the WoW-client-style fixture is itself valid, loadable Lua', () => {
    expect(() => execFileSync('lua', ['-e', `assert(load(${JSON.stringify(wowStyleFixture)}))`])).not.toThrow()
  })

  it('parses an array-style table (no explicit keys) as a JS array', () => {
    const source = 'MyList = {\n\t1,\n\t2,\n\t3,\n}\n'
    expect(decodeLuaSavedVariable(source, 'MyList')).toEqual([1, 2, 3])
  })

  it('unescapes quotes and backslashes in strings', () => {
    const source = 'MyName = "Say \\"hi\\" to back\\\\slash"\n'
    expect(decodeLuaSavedVariable(source, 'MyName')).toBe('Say "hi" to back\\slash')
  })

  it('parses nil as null and booleans natively', () => {
    const source = 'MyTable = {["a"] = nil, ["b"] = true, ["c"] = false}\n'
    // Lua never actually serializes a nil-valued key (assigning nil removes
    // it from the table), but the parser should still handle the literal
    // token correctly if it ever appears.
    expect(decodeLuaSavedVariable(source, 'MyTable')).toEqual({ a: null, b: true, c: false })
  })
})
