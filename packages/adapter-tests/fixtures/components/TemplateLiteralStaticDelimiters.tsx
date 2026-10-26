'use client'

export function TemplateLiteralStaticDelimiters({ active, suffix }: { active: boolean; suffix?: string }) {
  return <div className={`literal-\${notCode} ${active ? 'on' : 'off'} ${suffix ?? '}'}`}>ok</div>
}
