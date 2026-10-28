import { TemplateDelimiterBadge } from './TemplateDelimiterBadge'

export function StaticChildQuotedKeys() {
  return (
    <div>
      <TemplateDelimiterBadge key="001" />
      <TemplateDelimiterBadge key="08" />
      <TemplateDelimiterBadge key="1e3" />
      <TemplateDelimiterBadge key="0x10" />
      <TemplateDelimiterBadge key="-0" />
      <TemplateDelimiterBadge key=" 1" />
      <TemplateDelimiterBadge key="true" />
      <TemplateDelimiterBadge key={7} />
      <TemplateDelimiterBadge key={"x"} />
      <TemplateDelimiterBadge key={`t${1}`} />
    </div>
  )
}
