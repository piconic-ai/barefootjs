'use client'

// Composite-row twin of TextareaRowBreakout (#2765): a nested child
// component in the row forces `useElementReconciliation`, routing row
// construction through `irToPlaceholderTemplate` instead of
// `irToHtmlTemplate` — the sibling builder that shared the same
// unescaped-textarea bug, unpatched by this PR's first revision.

import { createSignal } from '@barefootjs/client'

function Tag({ id }: { id: number }) {
  return <span className="tag">{id}</span>
}

export function TextareaRowBreakoutComposite() {
  const [value, setValue] = createSignal('a</textarea><b class="broke">X</b>')
  const [ids, setIds] = createSignal([1])

  return (
    <div>
      <button className="add" onClick={() => setIds([1, 2])}>add</button>
      <ul>
        {ids().map((id) => (
          <li key={id}>
            <Tag id={id} />
            <textarea className="ta" value={value()} onInput={() => setValue('a</textarea><b class="broke">X</b>')} />
          </li>
        ))}
      </ul>
    </div>
  )
}
