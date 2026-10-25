'use client'

import { TemplateDelimiterCard } from './TemplateDelimiterCard'
import { TemplateDelimiterBadge } from './TemplateDelimiterBadge'

export function JsxPropTemplateDelimiters() {
  return <TemplateDelimiterCard header={<span title="&#96; &#92; $&#123;notCode&#125;">&#96; &#92; $&#123;notCode&#125;<TemplateDelimiterBadge /></span>}>
    <p title="&#96; &#92; $&#123;notCode&#125;">&#96; &#92; $&#123;notCode&#125;</p>
  </TemplateDelimiterCard>
}
