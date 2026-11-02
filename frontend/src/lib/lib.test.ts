import { describe, expect, it } from 'vitest'
import { rate, worstQuality } from '@/modules/meetings/call/stats'
import { latestRequest } from './latest'
import { renderMarkdown, toPlainText } from './markdown'
import { PRESENCE_CHOICES, PRESENCE_LOOK } from './presence'

describe('latestRequest', () => {
  it('only the newest request counts', () => {
    const latest = latestRequest()
    const first = latest.start()
    const second = latest.start()
    expect(latest.isCurrent(first)).toBe(false)
    expect(latest.isCurrent(second)).toBe(true)
  })
})

describe('markdown', () => {
  it('removes scripts and event handlers', () => {
    const html = renderMarkdown('Hi <script>alert(1)</script><img src=x onerror="alert(2)">')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
  })

  it('keeps links from reaching back into the app', () => {
    const html = renderMarkdown('<a href="https://example.com" target="_blank">site</a>')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('turns mentions into chips and plain text into previews', () => {
    expect(renderMarkdown('Hi @[Ada Lovelace](11111111-2222-3333-4444-555555555555)')).toContain('<span class="mention">@Ada Lovelace</span>')
    expect(toPlainText('**Bold** and [a link](https://x.test)')).toBe('Bold and a link')
  })
})

describe('call quality', () => {
  it('rates delay and loss', () => {
    expect(rate(80, 0)).toBe('good')
    expect(rate(450, 3)).toBe('fair')
    expect(rate(900, 15)).toBe('poor')
  })

  it('takes the worst of several connections', () => {
    expect(worstQuality(['good', 'poor', 'fair'])).toBe('poor')
    expect(worstQuality([null, undefined])).toBe(null)
  })
})

describe('presence', () => {
  it('has a look for every status people can choose', () => {
    for (const choice of PRESENCE_CHOICES) expect(PRESENCE_LOOK[choice.status]).toBeDefined()
  })
})
