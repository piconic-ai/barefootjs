'use client'

// Root for the `module-const-member-key-hydrate` fixture. Each module const
// below (`label`, `name`, `text`, `tag`) reads `process`, which the browser
// lacks, so declaring one in the client module throws at hydrate. Another
// module const names it only as an object key (`label`, `tag`), a member name
// (`D.label`), an arrow parameter (`name`) or a function-expression parameter
// (`text`): none of those is a read, so none of the four may reach the client
// module. `base` IS read (as an object value), so it must stay declared.
import { createSignal } from '@barefootjs/client'

const label = process.env.SERVER_ONLY
const name = process.env.SERVER_ONLY
const text = process.env.SERVER_ONLY
const tag = process.env.SERVER_ONLY
const base = 'b'
const D = { label: 'm', tag: base, shown: 's' }
const LABEL = D.label
const NAMES = ['n'].map(name => name.toUpperCase())
const TEXTS = ['t'].map(function (text) { return text + '!' })

export function ModuleConstMemberKeyHydrate() {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <p data-slot="label">{LABEL}</p>
      <p data-slot="tag">{D.shown}</p>
      <button onClick={() => setCount(count() + NAMES.length * TEXTS.length)}>{count()}</button>
    </div>
  )
}
