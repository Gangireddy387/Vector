import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PageFrame from './PageFrame.vue'

describe('PageFrame', () => {
  it('applies default pad contract matching PageFrame docs', () => {
    const wrapper = mount(PageFrame, { slots: { default: '<p>content</p>' } })
    const classes = wrapper.get('[data-slot="page-frame"]').classes()
    expect(classes).toEqual(expect.arrayContaining(['p-3', 'md:p-5', 'lg:p-6']))
  })

  it('supports bare fill-height shells without pad', () => {
    const wrapper = mount(PageFrame, {
      props: { mode: 'bare', pad: 'none', gap: 'none' },
      slots: { default: '<div>pane</div>' },
    })
    const classes = wrapper.get('[data-slot="page-frame"]').classes()
    expect(classes).not.toContain('p-3')
    expect(classes).not.toContain('space-y-4')
  })
})
