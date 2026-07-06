import { $, $t, __bfSlot, __bfText, createComponent, createDisposableEffect, createEffect, createSignal, escapeAttr, escapeText, hydrate, insert, mapArray, qsa } from '@barefootjs/client/runtime'


export function initAIChatInteractive(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [messages, setMessages] = createSignal([])
  const [input, setInput] = createSignal('')
  const [streamingText, setStreamingText] = createSignal('')
  const [isStreaming, setIsStreaming] = createSignal(false)
  const send = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming()) return

    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: trimmed }])
    setInput('')
    setIsStreaming(true)
    setStreamingText('')

    const es = new EventSource(`api/ai-chat?q=${encodeURIComponent(trimmed)}`)

    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        const final = streamingText()
        setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: final }])
        setStreamingText('')
        setIsStreaming(false)
        es.close()
      } else {
        const token = JSON.parse(e.data)
        setStreamingText(prev => prev + token)
      }
    }

    es.onerror = () => {
      setIsStreaming(false)
      es.close()
    }
  }
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.isComposing) send(input())
  }

  const [_s6, _s7, _s2, _s5] = $(__scope, 's6', 's7', 's2', 's5')

  createEffect(() => {
    if (_s6) {
      const __val = String(input())
      if (_s6.value !== __val) _s6.value = __val
      _s6.disabled = !!(isStreaming())
    }
  })

  createEffect(() => {
    if (_s7) {
      _s7.disabled = !!(isStreaming())
    }
  })

  insert(__scope, 's2', () => isStreaming(), {
    template: () => { const __slots = []; return { html: `<div bf-c="s2" class="chat-msg chat-assistant"><div class="chat-bubble"><p bf="s4"><!--bf:s3-->${__bfSlot(streamingText(), __slots)}<!--/--><span class="streaming-cursor">▌</span></p></div></div>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
      const __disposers = []
      let __anchor_s3 = $t(__branchScope, 's3')[0]
      __disposers.push(createDisposableEffect(() => {
        const __val = streamingText()
        __anchor_s3 = __bfText(__anchor_s3, __val)
      }))
      return () => __disposers.forEach(d => d())
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s2--><!--bf-cond-end:s2-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s6) _s6.addEventListener('input', e => setInput(e.target.value))
  if (_s6) _s6.addEventListener('keydown', handleKeyDown)
  if (_s7) _s7.addEventListener('click', () => { send(input()) })
  createEffect(() => {
    messages()
    streamingText()
    const el = document.getElementById('chat-messages')
    if (el) el.scrollTop = el.scrollHeight
  })
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<div data-key="" bf="s1"><div class="chat-bubble"><p><!--bf:s0--><!--/--></p></div></div>`
  mapArray(() => messages(), _s5, (msg) => String(msg.id), (msg, __idx, __existing) => {
    const __el = __existing ?? __tpl_l0.content.firstElementChild.cloneNode(true)
    { const __ra_s1 = qsa(__el, '[bf="s1"]')
    if (__ra_s1) {
      createEffect(() => {
        { const __v = `chat-msg chat-${msg().role}`; if (__v != null) __ra_s1.setAttribute('class', String(__v)); else __ra_s1.removeAttribute('class') }
      })
    } }
    { const [__rt_s0] = $t(__el, 's0')
    if (__rt_s0) createEffect(() => { __rt_s0.textContent = String(msg().content) }) }
    return __el
  }, 'l0')

}

hydrate('AIChatInteractive', { init: initAIChatInteractive, template: (_p) => `<div class="chat-container"><div class="chat-messages" id="chat-messages" bf="s5"><!--bf-loop:l0-->${([]).map((msg) => `<div data-key="${msg.id}" ${(`chat-msg chat-${msg.role}`) != null ? 'class="' + escapeAttr(`chat-msg chat-${msg.role}`) + '"' : ''} bf="s1"><div class="chat-bubble"><p><!--bf:s0-->${escapeText(msg.content)}<!--/--></p></div></div>`).join('')}<!--bf-/loop:l0-->${(false) ? `<div bf-c="s2" class="chat-msg chat-assistant"><div class="chat-bubble"><p bf="s4"><!--bf:s3-->${escapeText((''))}<!--/--><span class="streaming-cursor">▌</span></p></div></div>` : `<!--bf-cond-start:s2--><!--bf-cond-end:s2-->`}</div><div class="chat-input-area"><input type="text" class="chat-input" placeholder="Type a message..." ${(('')) != null ? 'value="' + escapeAttr(('')) + '"' : ''} ${(false) ? 'disabled' : ''} bf="s6" /><button class="chat-send" ${(false) ? 'disabled' : ''} bf="s7"> Send </button></div></div>` })
export function AIChatInteractive(_p, __bfKey) { return createComponent('AIChatInteractive', _p, __bfKey) }
