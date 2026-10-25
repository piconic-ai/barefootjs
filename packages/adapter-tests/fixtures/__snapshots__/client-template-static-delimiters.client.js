import { $, createComponent, createSignal, escapeAttr, escapeText, hydrate, insert, lazySlots, mapArrayLazy, textOrNode } from '@barefootjs/client/runtime'


export function initClientTemplateStaticDelimiters(__scope, _p = {}) {
  if (!__scope) return
  const __scopeId = __scope.getAttribute('bf-s')

  const [rows, setRows] = createSignal([1, 2])

  const [_s0, _s1, _s3, _s4] = $(__scope, 's0', 's1', 's3', 's4')

  insert(__scope, 's3', () => rows().length > 0, {
    template: () => { const __slots = []; return { html: `<b bf-c="s3" title="\` \\ \${notCode} \\n \${rows}">\` \\ \${notCode} \\n \${rows}</b>`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  }, {
    template: () => { const __slots = []; return { html: `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`, slots: __slots } },
    bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {
    }
  })

  if (_s0) _s0.addEventListener('click', () => setRows([...rows(), rows().length + 1]))
  if (_s1) _s1.addEventListener('click', () => setRows([]))
  const __tpl_l0 = document.createElement('template')
  __tpl_l0.innerHTML = `<p data-key="" title="\` \\ \${notCode} \\n \${rows}">\` \\ \${notCode} \\n \${rows} <!--bf:s2--><!--/--></p>`
  const __lzs_l0 = [{ id: 's2', kind: 'text', path: [] }]
  mapArrayLazy(() => rows(), _s4, (row) => String(row), {
    createRow: (__e, __idx) => {
      const row = () => __e.item
      const __el = __tpl_l0.content.firstElementChild.cloneNode(true)
      const __r = __e.refs = [lazySlots(__el, __lzs_l0)]
      const __l = __e.last = []
      { const __x = row()
      __r[0]('s2', textOrNode(__x))
      __l[0] = __x }
      return __el
    },
    applyItem: (__e) => {
      const row = () => __e.item
      const __r = __e.refs ?? (__e.refs = [])
      const __l = __e.last ?? (__e.last = [])
      const __d = __r[0] ?? (__r[0] = lazySlots(__e.primaryEl, __lzs_l0))
      { const __x = row()
      if (!(0 in __l) || !Object.is(__l[0], __x)) __d('s2', textOrNode(__x))
      __l[0] = __x }
    },
  }, 'l0')

}

hydrate('ClientTemplateStaticDelimiters', { init: initClientTemplateStaticDelimiters, template: (_p) => `<div bf="s4"><button class="add" bf="s0">Add</button><button class="clear" bf="s1">Clear</button><span title="\` \\ \${notCode} \\n \${rows}">\` \\ \${notCode} \\n \${rows}</span><!--bf-loop:l0-->${([1, 2]).map((row) => `<p data-key="${escapeAttr(row)}" title="\` \\ \${notCode} \\n \${rows}">\` \\ \${notCode} \\n \${rows} <!--bf:s2-->${escapeText(row)}<!--/--></p>`).join('')}<!--bf-/loop:l0-->${([1, 2]).length > 0 ? `<b bf-c="s3" title="\` \\ \${notCode} \\n \${rows}">\` \\ \${notCode} \\n \${rows}</b>` : `<!--bf-cond-start:s3--><!--bf-cond-end:s3-->`}</div>` })
export function ClientTemplateStaticDelimiters(_p, __bfKey) { return createComponent('ClientTemplateStaticDelimiters', _p, __bfKey) }
