'use client'

import { createSignal } from '@barefootjs/client'
import { SlotPositionsCard } from './SlotPositionsCard'
import { TemplateDelimiterBadge } from './TemplateDelimiterBadge'

export function JsxPropNestedComponentPositions() {
  const [count, setCount] = createSignal(0)
  return (
    <SlotPositionsCard header={<span className="h">head<TemplateDelimiterBadge /></span>}>
      <button onClick={() => setCount(n => n + 1)}>{count()}</button>
    </SlotPositionsCard>
  )
}
