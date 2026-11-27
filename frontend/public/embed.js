/**
 * Vector workspace embed loader for partner apps.
 * Usage:
 *   VectorEmbed.mount('#root', { url: embedUrlFromSessionApi })
 *   VectorEmbed.mount('#root', { url: embedUrl, height: '100%' })
 */
;(function (global) {
  'use strict'

  function resolveTarget(target) {
    if (!target) throw new Error('VectorEmbed.mount: pass a CSS selector or HTMLElement')
    if (typeof target === 'string') {
      const el = document.querySelector(target)
      if (!el) throw new Error('VectorEmbed.mount: element not found: ' + target)
      return el
    }
    return target
  }

  function mount(target, options) {
    const opts = options || {}
    const url = opts.url
    if (!url || typeof url !== 'string') throw new Error('VectorEmbed.mount: options.url is required (from POST /api/embed/session)')

    const host = resolveTarget(target)
    host.innerHTML = ''
    host.style.position = host.style.position || 'relative'
    if (!host.style.minHeight) host.style.minHeight = opts.height || '720px'

    const frame = document.createElement('iframe')
    frame.src = url
    frame.title = opts.title || 'Vector workspace'
    frame.allow = opts.allow || 'clipboard-read; clipboard-write; microphone; camera; display-capture'
    frame.setAttribute('allowfullscreen', 'true')
    frame.style.cssText =
      'border:0;width:100%;height:' +
      (opts.height || '100%') +
      ';min-height:' +
      (opts.minHeight || '720px') +
      ';border-radius:' +
      (opts.radius || '12px') +
      ';background:transparent;'

    host.appendChild(frame)
    return {
      iframe: frame,
      destroy: function () {
        if (frame.parentNode) frame.parentNode.removeChild(frame)
      },
    }
  }

  global.VectorEmbed = { mount: mount }
})(typeof window !== 'undefined' ? window : globalThis)
