# Benchmark App Contract

Every framework app under `benchmarks/apps/<name>/` MUST satisfy this
contract exactly. The runner treats all apps identically — any deviation
invalidates the comparison. Semantics follow the krausest
js-framework-benchmark (keyed category).

## Build output

- `bun benchmarks/runner/build.ts` builds every app.
- Each app provides `benchmarks/apps/<name>/build.ts` exporting
  `build(): Promise<void>` that writes a self-contained
  `benchmarks/apps/<name>/dist/` directory:
  - `dist/index.html` — loads the app's JS via relative
    `<script type="module">` (and `./styles.css`). No external network
    resources.
  - `dist/app.js` — production bundle: minified, `process.env.NODE_ENV`
    defined as `"production"`, ESM. A single-file bundle is preferred; if
    the framework's standard pipeline emits multiple local modules (e.g. a
    shared runtime + component module + importmap), that is acceptable —
    the reported "shipped JS" size is the total of all `.js` files in
    `dist/`.
  - `dist/styles.css` — copied from `benchmarks/apps/shared/styles.css`.
- Frameworks are bundled from the versions in the repo root `node_modules`
  (react 19.x, solid-js 1.9.x, `@barefootjs/*` workspace sources).
- BarefootJS app uses the real compiler pipeline (`bf build` /
  `packages/cli`), NOT hand-written DOM. Solid app uses `babel-preset-solid`
  (real template compilation). React uses the automatic JSX runtime.

## Page structure

```html
<div id="main">
  <div class="jumbotron">
    <button id="run">Create 1,000 rows</button>
    <button id="runlots">Create 10,000 rows</button>
    <button id="add">Append 1,000 rows</button>
    <button id="update">Update every 10th row</button>
    <button id="clear">Clear</button>
    <button id="swaprows">Swap Rows</button>
  </div>
  <table class="table"><tbody id="tbody"> ... rows ... </tbody></table>
</div>
```

Row markup (identical shape in every app):

```html
<tr class="danger"?>            <!-- class="danger" iff selected -->
  <td class="col-md-1">{id}</td>
  <td class="col-md-4"><a class="lbl">{label}</a></td>
  <td class="col-md-1"><a class="remove">x</a></td>
  <td class="col-md-6"></td>
</tr>
```

The `<tbody>` element must exist even when empty and must carry `id="tbody"`.

## Behavior (krausest keyed semantics)

Shared data generator: `benchmarks/apps/shared/data.ts` (`buildData(count)`),
imported by every app at build time. Row ids increment monotonically for the
lifetime of the page.

| Trigger | Behavior |
|---|---|
| `#run` click | Replace ALL rows with 1,000 freshly built rows |
| `#runlots` click | Replace ALL rows with 10,000 freshly built rows |
| `#add` click | Append 1,000 freshly built rows to the existing table |
| `#update` click | For every 10th row (indexes 0, 10, 20, …): `label += ' !!!'` |
| `#clear` click | Remove all rows |
| `#swaprows` click | If ≥ 999 rows: swap the row data at index 1 and index 998 |
| click on `a.lbl` | Select that row: it (and only it) gets `class="danger"` |
| click on `a.remove` | Remove that row |

Implementations must be **keyed**: row identity follows row id (React `key`,
Solid `<For>`, BarefootJS keyed `.map`). Selection state must not rebuild
unrelated rows' DOM in fine-grained frameworks; in React the standard
`memo`ized-row pattern applies.

Each app must be the framework's **idiomatic optimized** implementation,
modeled on the official krausest implementation for that framework
(`frameworks/keyed/react-hooks`, `frameworks/keyed/solid`). Do not add
exotic hand-tuning that no real app would ship (no manual DOM bypass, no
scheduler hacks); do not omit standard optimizations either (`memo`,
`useCallback`, event delegation as provided by the framework).

## Readiness signal

After the app has mounted and is interactive, set:

```js
document.body.dataset.ready = '1'
```

The runner waits for this before any interaction.

## Determinism rules

- No timers, no rAF loops, no async work after ready (apps must be idle).
- All state updates triggered by the click must be applied to the DOM by the
  time the runner's post-click double-rAF fence resolves. (All three
  frameworks flush discrete click handlers synchronously or before paint;
  do not introduce `startTransition`/deferred updates.)
- `Math.random()` is allowed inside `buildData` only (krausest parity).

## Correctness checks (run by the harness, per framework)

After each operation the runner asserts:
- row count matches expectation,
- first/last row id + label match expectation where deterministic,
- after select: exactly one `tr.danger`,
- after swap: previous row[1] content now at row[998] and vice versa,
- after remove: the removed id is gone and count decremented.

An app that fails a check is reported as FAILED for that op — no timing is
published for it.
