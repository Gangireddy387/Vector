import { describe, expect, it } from 'vitest'
import { aiSourceHint } from './api/ai.api'

describe('aiSourceHint', () => {
  it('explains heuristic and degraded sources', () => {
    expect(aiSourceHint('openai')).toBeUndefined()
    expect(aiSourceHint('heuristic')).toMatch(/OpenAI key/)
    expect(aiSourceHint('degraded')).toMatch(/unavailable/)
  })
})
