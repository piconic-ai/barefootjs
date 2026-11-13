'use client'

// Root for the `const-object-prop-identity-hydrate` fixture. A const whose
// initializer allocates (an object or array literal, `new`, an arrow, a
// module-scope object) and reads nothing reactive is one value: every read of
// the child prop it is passed as sees that same value, after hydration, in a
// row the client builds and through a component that forwards it. `Same`
// renders `same`, once its button is clicked, when two reads of its prop are
// the same value.
import { createSignal } from '@barefootjs/client'

const MODULE_TOKEN = { n: 5 }

type Token = { n: number } | number[] | Map<string, number> | (() => number)

// The comparison runs in the click handler, so the server renders only the
// initial `unchecked` and no backend has to compare objects.
function Same(props: { token: Token }) {
  const [result, setResult] = createSignal('unchecked')
  return (
    <span>
      <button onClick={() => setResult(props.token === props.token ? 'same' : 'different')}>check</button>
      <output>{result()}</output>
    </span>
  )
}

// Reads the prop's `n` on click. A const that reaches reactive state through
// a local alias (`const get = count`) is still reactive, so the read after
// `bump` must see the new count.
function Reads(props: { token: { n: number } }) {
  const [result, setResult] = createSignal('unchecked')
  return (
    <span>
      <button onClick={() => setResult(String(props.token.n))}>read</button>
      <output>{result()}</output>
    </span>
  )
}

// Wrapped in an element: a component-rooted forwarder is a separate case.
function Forward(props: { token: Token }) {
  return <i><Same token={props.token} /></i>
}

export function ConstObjectPropIdentityHydrate() {
  const [rows, setRows] = createSignal([{ id: '1' }, { id: '2' }])
  const obj = { n: 1 }
  const arr = [1, 2]
  const made = new Map<string, number>()
  const fn = () => obj.n
  const [count, setCount] = createSignal(0)
  const get = count
  const live = { n: get() }
  return (
    <div className="root">
      <p className="obj"><Same token={obj} /></p>
      <p className="arr"><Same token={arr} /></p>
      <p className="made"><Same token={made} /></p>
      <p className="module"><Same token={MODULE_TOKEN} /></p>
      <p className="fn"><Same token={fn} /></p>
      <p className="forward"><Forward token={obj} /></p>
      <p className="alias"><Reads token={live} /></p>
      <button className="bump" onClick={() => setCount(count() + 1)}>bump</button>
      <button className="add" onClick={() => setRows([...rows(), { id: '3' }])}>add</button>
      <ul>{rows().map(r => <li key={r.id}><Same token={obj} /></li>)}</ul>
    </div>
  )
}
