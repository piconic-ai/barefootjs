import { $, __bfSlot, createComponent, createDisposableEffect, createEffect, createSignal, escapeAttr, escapeText, escapeTextOrNode, hydrate, insert, lazySlots, mapArrayLazy, qsa, textOrNode } from '@barefootjs/client/runtime'


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
      const __bfw_s3 = lazySlots(__branchScope, [{ id: 's3', kind: 'markup', path: [] }])
      __disposers.push(createDisposableEffect(() => { __bfw_s3('s3', escapeTextOrNode(streamingText())) }))
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
  const __lzc_l0 = (__e) => {
    const __el = __e.primaryEl
    return [qsa(__el, '[bf="s1"]'), lazySlots(__el, [{ id: 's0', kind: 'text', path: [] }])]
  }
  mapArrayLazy(() => messages(), _s5, (msg) => String(msg.id), {
    createRow: (__e, __idx) => {
      const msg = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [qsa(__el, '[bf="s1"]'), lazySlots(__el, [{ id: 's0', kind: 'text', path: [] }])]
      const __l = __e.last = []
      { const __t = __r[0]
      if (__t) {
        const __x = `chat-msg chat-${msg().role}`
        { const __v = __x; if (__v != null) __t.setAttribute('class', String(__v)); else __t.removeAttribute('class') }
        __l[0] = __x
      } }
      { const __x = msg().content
      __r[1]('s0', textOrNode(__x))
      __l[1] = __x }
      return __el
    },
    applyItem: (__e) => {
      const msg = () => __e.item
      const __r = __e.refs ?? (__e.refs = __lzc_l0(__e))
      const __l = __e.last ?? (__e.last = [])
      { const __t = __r[0]
      if (__t) {
        const __x = `chat-msg chat-${msg().role}`
        if (!(0 in __l) || !Object.is(__l[0], __x)) {
          { const __v = __x; if (__v != null) __t.setAttribute('class', String(__v)); else __t.removeAttribute('class') }
        }
        __l[0] = __x
      } }
      { const __x = msg().content
      if (!(1 in __l) || !Object.is(__l[1], __x)) __r[1]('s0', textOrNode(__x))
      __l[1] = __x }
    },
  }, 'l0')

}

hydrate('AIChatInteractive', { init: initAIChatInteractive, template: (_p) => `<div class="chat-container"><div class="chat-messages" id="chat-messages" bf="s5"><!--bf-loop:l0-->${([]).map((msg) => `<div data-key="${escapeAttr(msg.id)}" ${(`chat-msg chat-${msg.role}`) != null ? 'class="' + escapeAttr(`chat-msg chat-${msg.role}`) + '"' : ''} bf="s1"><div class="chat-bubble"><p><!--bf:s0-->${escapeText(msg.content)}<!--/--></p></div></div>`).join('')}<!--bf-/loop:l0-->${(false) ? `<div bf-c="s2" class="chat-msg chat-assistant"><div class="chat-bubble"><p bf="s4"><!--bf:s3-->${escapeText((''))}<!--/--><span class="streaming-cursor">▌</span></p></div></div>` : `<!--bf-cond-start:s2--><!--bf-cond-end:s2-->`}</div><div class="chat-input-area"><input type="text" class="chat-input" placeholder="Type a message..." ${(('')) != null ? 'value="' + escapeAttr(('')) + '"' : ''} ${(false) ? 'disabled' : ''} bf="s6" /><button class="chat-send" ${(false) ? 'disabled' : ''} bf="s7"> Send </button></div></div>` })
export function AIChatInteractive(_p, __bfKey) { return createComponent('AIChatInteractive', _p, __bfKey) }
