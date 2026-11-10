'use client'

// Root for the `const-object-prop-identity-hydrate` fixture. A const whose
// initializer allocates (an object or array literal, `new`, an arrow, a
// module-scope object) and reads nothing reactive is one value: every read of
// the child prop it is passed as sees that same value, after hydration, in a
// row the client builds and through a component that forwards it. `Same`
// renders `same` when two reads of its prop are the same value.
import { createSignal } from '@barefootjs/client'

const MODULE_TOKEN = { n: 5 }

function Same(props: { token: unknown }) {
  return <output>{props.token === props.token ? 'same' : 'different'}</output>
}

function Forward(props: { token: unknown }) {
  return <Same token={props.token} />
}

export function ConstObjectPropIdentityHydrate() {
  const [rows, setRows] = createSignal([{ id: '1' }, { id: '2' }])
  const obj = { n: 1 }
  const arr = [1, 2]
  const made = new Map()
  const fn = () => obj.n
  return (
    <div className="root">
      <p className="obj"><Same token={obj} /></p>
      <p className="arr"><Same token={arr} /></p>
      <p className="made"><Same token={made} /></p>
      <p className="module"><Same token={MODULE_TOKEN} /></p>
      <p className="fn"><Same token={fn} /></p>
      <p className="forward"><Forward token={obj} /></p>
      <button className="add" onClick={() => setRows([...rows(), { id: '3' }])}>add</button>
      <ul>{rows().map(r => <li key={r.id}><Same token={obj} /></li>)}</ul>
    </div>
  )
}
