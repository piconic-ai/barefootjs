'use client'

// Root for the `module-const-member-read-hydrate` fixture. Each module const
// below (`label`, `tag`, `name`, `shown`) reads `process`, which the browser
// lacks, so declaring one in the client module throws at hydrate. The
// component only names them as a member (`D.label` in the template and in a
// handler), an object key (`{ tag: ... }` in a handler), a callback parameter
// (`name =>` in a handler) or, inside the module helper `describe`, a member
// (`o.shown`) and an arrow parameter (`label =>`): none of those is a read, so
// none of the four may reach the client module. `D` and `describe` ARE read,
// so they must stay declared.
import { createSignal } from '@barefootjs/client'

const label = process.env.SERVER_ONLY
const tag = process.env.SERVER_ONLY
const name = process.env.SERVER_ONLY
const shown = process.env.SERVER_ONLY
const D = { label: 'm', tag: 't', shown: 's' }
function describe(o: { shown: string }) {
  return [o.shown].map(label => label + '!').join('')
}

export function ModuleConstMemberReadHydrate() {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <p data-slot="label">{D.label}</p>
      <p data-slot="shown">{D.shown}</p>
      <button
        onClick={() => {
          const o = { tag: D.tag }
          setCount(count() + [o.tag].map(name => name.length).length + (D.label === 'm' ? 1 : 0) + describe(D).length)
        }}
      >
        {count()}
      </button>
    </div>
  )
}
