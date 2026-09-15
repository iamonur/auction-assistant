import { describe, expect, it } from 'vitest'
import { encodeLuaSavedVariable, encodeLuaValue } from './luaSerializer'

describe('encodeLuaValue', () => {
  it('encodes primitives', () => {
    expect(encodeLuaValue('hello')).toBe('"hello"')
    expect(encodeLuaValue(42)).toBe('42')
    expect(encodeLuaValue(true)).toBe('true')
    expect(encodeLuaValue(false)).toBe('false')
    expect(encodeLuaValue(null)).toBe('nil')
    expect(encodeLuaValue(undefined)).toBe('nil')
  })

  it('escapes quotes, backslashes, and control characters in strings', () => {
    expect(encodeLuaValue('Say "hi"')).toBe('"Say \\"hi\\""')
    expect(encodeLuaValue('back\\slash')).toBe('"back\\\\slash"')
    expect(encodeLuaValue('line\nbreak')).toBe('"line\\nbreak"')
  })

  it('rejects non-finite numbers rather than emitting invalid Lua', () => {
    expect(() => encodeLuaValue(Infinity)).toThrow()
    expect(() => encodeLuaValue(NaN)).toThrow()
  })

  it('encodes arrays as sequential Lua tables', () => {
    expect(encodeLuaValue([1, 2, 3])).toBe('{1,2,3}')
  })

  it('encodes numeric-looking object keys with bracket syntax, not identifier sugar', () => {
    expect(encodeLuaValue({ 19019: 'Thunderfury' })).toBe('{[19019]="Thunderfury"}')
  })

  it('encodes string object keys with quoted bracket syntax', () => {
    expect(encodeLuaValue({ name: 'Test' })).toBe('{["name"]="Test"}')
  })

  it('encodes nested tables', () => {
    const value = { items: { 1: { n: 'A', p: 100 } } }
    expect(encodeLuaValue(value)).toBe('{["items"]={[1]={["n"]="A",["p"]=100}}}')
  })
})

describe('encodeLuaSavedVariable', () => {
  it('wraps the value as a global assignment', () => {
    expect(encodeLuaSavedVariable('MyAddonDB', { a: 1 })).toBe('MyAddonDB = {["a"]=1}\n')
  })
})
