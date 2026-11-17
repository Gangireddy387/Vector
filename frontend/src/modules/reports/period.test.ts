import { describe, expect, it } from 'vitest'
import { defaultReviewPeriod, describePeriod, PERIOD_PRESETS, presetRange } from './period'

describe('period helpers', () => {
  it('exposes every review preset', () => {
    expect(PERIOD_PRESETS.map((option) => option.value)).toEqual([
      'this_month',
      'last_month',
      'this_quarter',
      'last_quarter',
      'last_6_months',
      'this_year',
      'last_year',
    ])
  })

  it('returns YYYY-MM-DD ranges for each preset', () => {
    for (const option of PERIOD_PRESETS) {
      const range = presetRange(option.value)
      expect(range.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(range.from <= range.to).toBe(true)
    }
  })

  it('defaults the review period to this quarter', () => {
    expect(defaultReviewPeriod()).toEqual(presetRange('this_quarter'))
  })

  it('describes a matching preset with its label', () => {
    const period = presetRange('last_month')
    expect(describePeriod(period)).toMatch(/^Last month \(/)
  })

  it('describes a custom range without a preset label', () => {
    expect(describePeriod({ from: '2024-01-15', to: '2024-02-20' })).toMatch(/15 Jan 2024/)
    expect(describePeriod({ from: '2024-01-15', to: '2024-02-20' })).not.toMatch(/This month|Last month|This quarter/)
  })
})
