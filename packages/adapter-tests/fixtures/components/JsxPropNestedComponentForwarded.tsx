'use client'

import { SlotForwardCard } from './SlotForwardCard'
import { TemplateDelimiterBadge } from './TemplateDelimiterBadge'

export function JsxPropNestedComponentForwarded() {
  return <SlotForwardCard header={<span className="h">head<TemplateDelimiterBadge /></span>} />
}
