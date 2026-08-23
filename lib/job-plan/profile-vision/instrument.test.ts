import { describe, expect, it } from 'vitest'
import {
  inferInstrumentFromPrice,
  instrumentFromSymbol,
  MAJOR_LABEL_INTERVAL,
  R1_MERGE_TOLERANCE,
} from './instrument'

describe('instrument', () => {
  it('infers NQ above 10,000 and ES below', () => {
    expect(inferInstrumentFromPrice(29945.75)).toBe('NQ')
    expect(inferInstrumentFromPrice(6816)).toBe('ES')
  })

  it('parses Sierra symbols to their root, micros included', () => {
    expect(instrumentFromSymbol('NQU26')).toBe('NQ')
    expect(instrumentFromSymbol('ESZ26')).toBe('ES')
    expect(instrumentFromSymbol('MNQU26')).toBe('NQ')
    expect(instrumentFromSymbol('MESU26')).toBe('ES')
    expect(instrumentFromSymbol('CLX26')).toBeNull()
  })

  it('keeps the R1 ratio between the merge tolerance and the axis label interval', () => {
    expect(R1_MERGE_TOLERANCE).toEqual({ NQ: 20, ES: 5 })
    expect(MAJOR_LABEL_INTERVAL).toEqual({ NQ: 20, ES: 5 })
  })
})
