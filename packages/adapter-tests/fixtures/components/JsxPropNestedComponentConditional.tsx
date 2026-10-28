'use client'

import { SlotConditionalCard } from './SlotConditionalCard'
import { TemplateDelimiterBadge } from './TemplateDelimiterBadge'

export function JsxPropNestedComponentConditional() {
  return (
    <SlotConditionalCard
      show
      header={<span className="h">head<TemplateDelimiterBadge /></span>}
      footer={<b className="f">foot<TemplateDelimiterBadge /></b>}
    />
  )
}
