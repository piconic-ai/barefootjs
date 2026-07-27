// ---------------------------------------------------------------------------
// Lazy effect-graph loop prototype — spec/slot-unification.md §8's
// "row-level lazy EFFECT-GRAPH construction" follow-up, measurement spike.
// THROWAWAY quality, hand-written; appended verbatim to the built client
// bundle by build.ts (function declarations hoist in the module scope).
//
// An intentionally identical copy lives at
// benchmarks/ssr/apps/barefoot-lazy/client/lazy-loop.js for the SSR
// bench — two copies because the two benchmark trees are self-contained.
//
// The model this prototypes, per row of a plain loop (`mapArray` shape):
//   - Hydration first run: partition SSR rows into plain entries
//     { key, el, item, refs: null, lastClass: undefined }. Key is READ from
//     the SSR-rendered data-key (never written). NO createRoot, NO per-item
//     signal, NO per-row effect, NO querySelector, NO slot claim, NO DOM
//     writes.
//   - Item-driven updates are NOT reactive: the keyed reconciler already
//     knows which item changed and calls __bfLazyUpdateRow directly. The
//     row's text refs are claimed lazily on the first update (comment scan
//     inside that one row), then cached on the entry.
//   - CSR row creation: template clone + direct writes; refs are recorded
//     from the clone's known childNode paths — no scan.
//   - Outer-signal bindings (class={selected() === row.id ? 'danger' : ''})
//     are applied by ONE loop-level effect that iterates ALL entries with
//     per-entry dedup (entry.lastClass). On the effect's first run at
//     hydration, writes are skipped entirely (trust SSR); lastClass is
//     initialized from the computed value.
//   - Reorders/removals: same keyed diff + LIS minimal-move as the runtime's
//     mapArray; "dispose" is trivial because entries hold no reactive
//     resources.
//
// The row shape is hard-coded to the bench table row (a compiler would emit
// this shape from the loop's IR):
//   <tr data-key=".."><td><!--bf:ID--> id <!--/--></td>
//     <td><a class="lbl"><!--bf:LABEL--> label <!--/--></a></td>
//     <td><a class="remove">x</a></td><td></td></tr>
// ---------------------------------------------------------------------------

function __bfLazyLoopInit(container, loopId, tpl, slotIds) {
  return {
    container,
    loopId,
    tpl,
    slotIds, // [idSlotId, labelSlotId], e.g. ['s0', 's1'] (SSR) / ['s6', 's7'] (DOM)
    map: new Map(), // key -> entry
    list: [], // entries in item order
    start: null, // <!--bf-loop:ID--> comment
    end: null, // <!--bf-/loop:ID--> comment
    adopted: false, // hydration partition done
    classInit: false, // loop-level class effect has run at least once
    curSelected: 0, // mirror of the outer selected() signal, for non-reactive reads
  }
}

function __bfLazyMarkers(loop) {
  if (loop.start && loop.end && loop.start.isConnected && loop.end.isConnected) return
  const sVal = 'bf-loop:' + loop.loopId
  const eVal = 'bf-/loop:' + loop.loopId
  let start = null
  let end = null
  for (let n = loop.container.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 8 /* COMMENT_NODE */) continue
    if (n.nodeValue === sVal) start = n
    else if (n.nodeValue === eVal) end = n
  }
  loop.start = start
  loop.end = end
}

function __bfLazyTextAfter(marker) {
  const n = marker.nextSibling
  if (n && n.nodeType === 3 /* TEXT_NODE */) return n
  const t = document.createTextNode('')
  marker.parentNode.insertBefore(t, marker.nextSibling)
  return t
}

/**
 * Lazy per-row claim: first update to a row scans that row's comments for
 * its text-slot markers and caches the held Text refs on the entry. A row
 * that is never updated never runs this.
 */
function __bfLazyClaim(loop, en) {
  const ids = loop.slotIds
  const refs = new Array(ids.length).fill(null)
  let found = 0
  const walker = document.createTreeWalker(en.el, NodeFilter.SHOW_COMMENT)
  while (found < ids.length && walker.nextNode()) {
    const v = walker.currentNode.nodeValue
    for (let k = 0; k < ids.length; k++) {
      if (refs[k] === null && v === 'bf:' + ids[k]) {
        refs[k] = __bfLazyTextAfter(walker.currentNode)
        found++
        break
      }
    }
  }
  en.refs = refs
  return refs
}

/**
 * Plain (non-reactive) item-driven row update, called directly by the
 * reconciler when `!Object.is(entry.item, newItem)`. Per-field last-value
 * dedup comes from comparing the old item's fields to the new item's.
 */
function __bfLazyUpdateRow(loop, en, item) {
  const refs = en.refs || __bfLazyClaim(loop, en)
  const prev = en.item
  if (!Object.is(prev.id, item.id) && refs[0]) refs[0].nodeValue = String(item.id)
  if (!Object.is(prev.label, item.label) && refs[1]) refs[1].nodeValue = String(item.label)
  en.item = item
  // The class binding reads the item too (selected() === row.id), so an item
  // change must re-apply it. Non-reactive read via the mirrored signal value;
  // the loop-level effect owns the reactive (selected-driven) side.
  const cls = loop.curSelected === item.id ? 'danger' : ''
  if (en.lastClass !== cls) {
    en.el.setAttribute('class', cls)
    en.lastClass = cls
  }
}

/**
 * CSR row creation: template clone + direct writes. Refs are recorded from
 * the clone's known childNode paths (td[0] and td[1] > a), no comment scan.
 */
function __bfLazyCreateRow(loop, item, key) {
  const el = loop.tpl.content.firstElementChild.cloneNode(true)
  el.setAttribute('data-key', key)
  const td0 = el.childNodes[0]
  const idText = document.createTextNode(String(item.id))
  td0.insertBefore(idText, td0.childNodes[1]) // between <!--bf:ID--> and <!--/-->
  const lblAnchor = el.childNodes[1].childNodes[0]
  const lblText = document.createTextNode(String(item.label))
  lblAnchor.insertBefore(lblText, lblAnchor.childNodes[1])
  const cls = loop.curSelected === item.id ? 'danger' : ''
  // The eager build's per-row effect also always writes class (even '') on
  // its first run for created rows — match its DOM output exactly.
  el.setAttribute('class', cls)
  return { key, el, item, refs: [idText, lblText], lastClass: cls }
}

/**
 * The ONE loop-level binding application for the outer signal. Generic:
 * iterates ALL entries with per-entry dedup — no "only these rows changed"
 * special case, because that is what a compiler could mechanically emit.
 * `skipWrites` is true exactly once, on the hydration first run: SSR output
 * is trusted byte-identical, so lastClass is initialized without writing.
 */
function __bfLazyApplyClass(loop, sel, skipWrites) {
  const list = loop.list
  for (let i = 0; i < list.length; i++) {
    const en = list[i]
    const cls = sel === en.item.id ? 'danger' : ''
    if (skipWrites) {
      en.lastClass = cls
      continue
    }
    if (en.lastClass !== cls) {
      en.el.setAttribute('class', cls)
      en.lastClass = cls
    }
  }
}

/** Longest-increasing-subsequence — same algorithm as the runtime mapArray's. */
function __bfLazyLIS(arr) {
  const len = arr.length
  if (len === 0) return []
  const tails = []
  const prev = new Array(len).fill(-1)
  for (let i = 0; i < len; i++) {
    const v = arr[i]
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (arr[tails[mid]] < v) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]
    if (lo === tails.length) tails.push(i)
    else tails[lo] = i
  }
  const out = new Array(tails.length)
  let k = tails[tails.length - 1]
  for (let i = tails.length - 1; i >= 0; i--) {
    out[i] = k
    k = prev[k]
  }
  return out
}

/**
 * Keyed reconcile — mapArray's semantics (keyed diff, LIS minimal-move,
 * clear fast-path) minus every per-row reactive resource.
 */
function __bfLazyReconcile(loop, items) {
  __bfLazyMarkers(loop)
  const container = loop.container
  const start = loop.start
  const anchor = loop.end ?? null

  if (!loop.adopted) {
    loop.adopted = true
    // Hydration first run: partition existing SSR rows into entries.
    // NO createRoot / signal / effect / querySelector / claim / DOM writes.
    const doms = []
    for (let n = start ? start.nextSibling : container.firstChild; n && n !== anchor; n = n.nextSibling) {
      if (n.nodeType === 1 /* ELEMENT_NODE */) doms.push(n)
    }
    if (doms.length > 0) {
      const shared = Math.min(doms.length, items.length)
      for (let i = 0; i < shared; i++) {
        const el = doms[i]
        // READ the SSR-rendered key; positional item pairing assumes SSR
        // rendered exactly `items` in order (byte-parity invariant).
        const key = el.getAttribute('data-key')
        const en = { key, el, item: items[i], refs: null, lastClass: undefined }
        loop.map.set(key, en)
        loop.list.push(en)
      }
      for (let i = doms.length; i < items.length; i++) {
        const key = String(items[i].id)
        const en = __bfLazyCreateRow(loop, items[i], key)
        loop.map.set(key, en)
        loop.list.push(en)
        container.insertBefore(en.el, anchor)
      }
      for (let i = items.length; i < doms.length; i++) doms[i].remove()
      return
    }
    // No SSR rows (CSR mount): fall through to the normal keyed path.
  }

  if (items.length === 0) {
    // Clear fast-path, same as mapArray: one ranged delete between markers.
    if (loop.list.length > 0) {
      if (start && loop.end) {
        const range = document.createRange()
        range.setStartAfter(start)
        range.setEndBefore(loop.end)
        range.deleteContents()
      } else {
        for (const en of loop.list) en.el.remove()
      }
      loop.map.clear()
      loop.list = []
    }
    return
  }

  const seen = new Set()
  const next = new Array(items.length)
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const key = String(item.id)
    seen.add(key)
    let en = loop.map.get(key)
    if (en) {
      // Item-driven update: direct call, no signal, no setItem.
      if (!Object.is(en.item, item)) __bfLazyUpdateRow(loop, en, item)
    } else {
      en = __bfLazyCreateRow(loop, item, key)
      loop.map.set(key, en)
    }
    next[i] = en
  }
  for (const [key, en] of loop.map) {
    if (!seen.has(key)) {
      en.el.remove() // dispose is trivial: entries hold no reactive resources
      loop.map.delete(key)
    }
  }

  // LIS minimal-move reorder, same as mapArray.
  const pos = new Map()
  for (let i = 0; i < next.length; i++) pos.set(next[i].el, i)
  const domOrder = []
  for (let n = start ? start.nextSibling : container.firstChild; n && n !== anchor; n = n.nextSibling) {
    if (n.nodeType !== 1) continue
    const idx = pos.get(n)
    if (idx !== undefined) domOrder.push(idx)
  }
  const keep = new Array(next.length).fill(false)
  for (const li of __bfLazyLIS(domOrder)) keep[domOrder[li]] = true
  let o = 0
  while (o < next.length) {
    if (keep[o]) {
      o++
      continue
    }
    let u = o
    while (u < next.length && !keep[u]) u++
    const anchorNode = u < next.length ? next[u].el : anchor
    if (u - o === 1) {
      container.insertBefore(next[o].el, anchorNode)
    } else {
      const frag = document.createDocumentFragment()
      for (let r = o; r < u; r++) frag.appendChild(next[r].el)
      container.insertBefore(frag, anchorNode)
    }
    o = u
  }
  loop.list = next
}
