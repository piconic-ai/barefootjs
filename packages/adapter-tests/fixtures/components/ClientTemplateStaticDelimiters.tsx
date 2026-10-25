'use client'

import { createSignal } from '@barefootjs/client'

export function ClientTemplateStaticDelimiters() {
  const [rows, setRows] = createSignal([1, 2])
  return <div>
    <button className="add" onClick={() => setRows([...rows(), rows().length + 1])}>Add</button>
    <button className="clear" onClick={() => setRows([])}>Clear</button>
    <span title="&#96; &#92; $&#123;notCode&#125; &#92;n $&#123;rows&#125;">&#96; &#92; $&#123;notCode&#125; &#92;n $&#123;rows&#125;</span>
    {rows().map(row => <p key={row} title="&#96; &#92; $&#123;notCode&#125; &#92;n $&#123;rows&#125;">&#96; &#92; $&#123;notCode&#125; &#92;n $&#123;rows&#125; {row}</p>)}
    {rows().length > 0 ? <b title="&#96; &#92; $&#123;notCode&#125; &#92;n $&#123;rows&#125;">&#96; &#92; $&#123;notCode&#125; &#92;n $&#123;rows&#125;</b> : null}
  </div>
}
