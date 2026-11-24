import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import SegmentedControl from './SegmentedControl.vue'

describe('SegmentedControl', () => {
  it('renders tabs and updates the model on click', async () => {
    const model = ref('open')
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: model.value,
        'onUpdate:modelValue': (value: string) => {
          model.value = value
        },
        ariaLabel: 'My work',
        options: [
          { value: 'open', label: 'Open', count: 3 },
          { value: 'done', label: 'Done', count: 1 },
        ],
      },
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]!.attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('My work')

    await tabs[1]!.trigger('click')
    await nextTick()
    expect(model.value).toBe('done')
  })

  it('hides zero counts and styles badge counts', () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: 'chat',
        options: [
          { value: 'chat', label: 'Chat', count: 0, badge: true },
          { value: 'teams', label: 'Teams', count: 2, badge: true },
        ],
      },
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[0]!.text()).toBe('Chat')
    expect(tabs[1]!.text()).toContain('2')
    expect(tabs[1]!.html()).toContain('bg-primary')
  })
})
