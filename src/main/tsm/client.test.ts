import { describe, expect, it } from 'vitest'
import { parseCsv } from './client'

describe('parseCsv', () => {
  it('splits plain comma-separated rows', () => {
    expect(parseCsv('itemId,name,marketValue\n1,Linen Cloth,100\n')).toEqual([
      ['itemId', 'name', 'marketValue'],
      ['1', 'Linen Cloth', '100']
    ])
  })

  it('keeps a comma inside a quoted field intact', () => {
    expect(parseCsv('itemId,name\n1,"Foo, Bar"\n')).toEqual([
      ['itemId', 'name'],
      ['1', 'Foo, Bar']
    ])
  })

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsv('id,name\n1,"Say ""hi"" now"\n')).toEqual([
      ['id', 'name'],
      ['1', 'Say "hi" now']
    ])
  })

  it('strips carriage returns from CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('handles a final row with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n1,2\n\n3,4\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4']
    ])
  })
})
