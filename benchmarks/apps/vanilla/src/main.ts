/**
 * Vanilla JS reference implementation — the performance floor for the
 * BarefootJS benchmark suite. Modeled on the official krausest
 * js-framework-benchmark `keyed/vanillajs` approach: direct DOM
 * manipulation, event delegation on the tbody, an array of row elements
 * (identity = row id) for keyed reconciliation, in-place text updates,
 * `insertBefore` for swap, `.remove()` for row removal.
 *
 * No framework, no virtual DOM, no signals — this is the floor every other
 * app in the suite is measured against.
 */
import { buildData, type RowData } from '../../shared/data.ts'

interface RowRef {
  id: number
  tr: HTMLTableRowElement
  lbl: HTMLAnchorElement
}

const tbody = document.getElementById('tbody') as HTMLTableSectionElement

// Keyed row bookkeeping: `rows` preserves DOM order (used by #update and
// #swaprows, which operate by position); `byId` gives O(1) lookup by row id.
let rows: RowRef[] = []
const byId = new Map<number, RowRef>()
let selectedTr: HTMLTableRowElement | null = null

function buildRow(row: RowData): RowRef {
  const tr = document.createElement('tr')

  const tdId = document.createElement('td')
  tdId.className = 'col-md-1'
  tdId.textContent = String(row.id)

  const tdLabel = document.createElement('td')
  tdLabel.className = 'col-md-4'
  const lbl = document.createElement('a')
  lbl.className = 'lbl'
  lbl.textContent = row.label
  tdLabel.appendChild(lbl)

  const tdRemove = document.createElement('td')
  tdRemove.className = 'col-md-1'
  const remove = document.createElement('a')
  remove.className = 'remove'
  remove.textContent = 'x'
  tdRemove.appendChild(remove)

  const tdSpacer = document.createElement('td')
  tdSpacer.className = 'col-md-6'

  tr.append(tdId, tdLabel, tdRemove, tdSpacer)

  const ref: RowRef = { id: row.id, tr, lbl }
  byId.set(row.id, ref)
  return ref
}

function clearSelection() {
  if (selectedTr) {
    selectedTr.classList.remove('danger')
    selectedTr = null
  }
}

function replaceAll(count: number) {
  clearSelection()
  byId.clear()
  const data = buildData(count)
  const frag = document.createDocumentFragment()
  const next: RowRef[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const ref = buildRow(data[i])
    frag.appendChild(ref.tr)
    next[i] = ref
  }
  tbody.textContent = ''
  tbody.appendChild(frag)
  rows = next
}

function append(count: number) {
  const data = buildData(count)
  const frag = document.createDocumentFragment()
  for (let i = 0; i < count; i++) {
    const ref = buildRow(data[i])
    frag.appendChild(ref.tr)
    rows.push(ref)
  }
  tbody.appendChild(frag)
}

function updateEveryTenth() {
  for (let i = 0; i < rows.length; i += 10) {
    rows[i].lbl.textContent = `${rows[i].lbl.textContent} !!!`
  }
}

function clearAll() {
  clearSelection()
  byId.clear()
  rows = []
  tbody.textContent = ''
}

function swapRows() {
  if (rows.length <= 998) return
  const a = rows[1]
  const b = rows[998]
  rows[1] = b
  rows[998] = a

  // Classic two-node swap: move `b.tr` to where `a.tr` was, then move
  // `a.tr` to where `b.tr` was (captured via its original next sibling).
  const bNextSibling = b.tr.nextSibling
  tbody.insertBefore(b.tr, a.tr)
  tbody.insertBefore(a.tr, bNextSibling)
}

function selectRow(tr: HTMLTableRowElement) {
  if (selectedTr === tr) return
  clearSelection()
  tr.classList.add('danger')
  selectedTr = tr
}

function removeRow(tr: HTMLTableRowElement) {
  const idAttr = tr.querySelector('.col-md-1')?.textContent
  const id = idAttr ? Number(idAttr) : Number.NaN
  const idx = rows.findIndex((r) => r.tr === tr)
  if (idx !== -1) rows.splice(idx, 1)
  byId.delete(id)
  if (selectedTr === tr) selectedTr = null
  tr.remove()
}

// Event delegation on the tbody — no per-row listeners.
tbody.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  if (target.classList.contains('remove')) {
    const tr = target.closest('tr') as HTMLTableRowElement | null
    if (tr) removeRow(tr)
  } else if (target.classList.contains('lbl')) {
    const tr = target.closest('tr') as HTMLTableRowElement | null
    if (tr) selectRow(tr)
  }
})

document.getElementById('run')!.addEventListener('click', () => replaceAll(1000))
document.getElementById('runlots')!.addEventListener('click', () => replaceAll(10000))
document.getElementById('add')!.addEventListener('click', () => append(1000))
document.getElementById('update')!.addEventListener('click', () => updateEveryTenth())
document.getElementById('clear')!.addEventListener('click', () => clearAll())
document.getElementById('swaprows')!.addEventListener('click', () => swapRows())

document.body.dataset.ready = '1'
