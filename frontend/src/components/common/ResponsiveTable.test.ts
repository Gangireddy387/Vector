import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ResponsiveTable from './ResponsiveTable.vue'

describe('ResponsiveTable', () => {
  it('defaults to xl visibility classes', () => {
    const wrapper = mount(ResponsiveTable, {
      slots: {
        list: '<div data-test="list">list</div>',
        table: '<table data-test="table"><tbody></tbody></table>',
      },
    })

    expect(wrapper.get('[data-slot="responsive-table-list"]').classes()).toContain('xl:hidden')
    expect(wrapper.get('[data-slot="responsive-table-table"]').classes()).toContain('hidden')
    expect(wrapper.get('[data-slot="responsive-table-table"]').classes()).toContain('xl:block')
    expect(wrapper.get('[data-test="list"]').text()).toBe('list')
    expect(wrapper.find('[data-test="table"]').exists()).toBe(true)
  })

  it('uses lg breakpoint when requested', () => {
    const wrapper = mount(ResponsiveTable, {
      props: { breakpoint: 'lg' },
      slots: {
        list: '<p>cards</p>',
        table: '<table><tbody></tbody></table>',
      },
    })

    expect(wrapper.get('[data-slot="responsive-table-list"]').classes()).toContain('lg:hidden')
    expect(wrapper.get('[data-slot="responsive-table-table"]').classes()).toContain('lg:block')
  })
})
