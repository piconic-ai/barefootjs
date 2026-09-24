"use client"
/**
 * ComboboxDemo Components
 *
 * Interactive demos for Combobox component.
 * Based on shadcn/ui patterns for practical use cases.
 */

import { createSignal, createMemo } from '@barefootjs/client'
import {
  Combobox,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxContent,
  ComboboxInput,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxGroup,
  ComboboxSeparator,
} from '@ui/components/ui/combobox'

/**
 * Basic combobox example
 * Framework selector with search and value display
 */
export function ComboboxBasicDemo() {
  const [value, setValue] = createSignal('')

  return (
    <div className="space-y-3">
      <Combobox value={value()} onValueChange={setValue}>
        <ComboboxTrigger className="w-[280px]" showPlaceholder={!value()}>
          <ComboboxValue placeholder="Select framework..." />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Search framework..." />
          <ComboboxEmpty>No framework found.</ComboboxEmpty>
          <ComboboxItem value="next" defaultSelected>Next.js</ComboboxItem>
          <ComboboxItem value="svelte">SvelteKit</ComboboxItem>
          <ComboboxItem value="nuxt">Nuxt</ComboboxItem>
          <ComboboxItem value="remix">Remix</ComboboxItem>
          <ComboboxItem value="astro">Astro</ComboboxItem>
        </ComboboxContent>
      </Combobox>
      <p className="text-sm text-muted-foreground">
        Selected: <span className="selected-value font-medium">{value() || 'None'}</span>
      </p>
    </div>
  )
}

/**
 * Form example with combobox
 * Language picker with multiple comboboxes for a developer profile form
 */
export function ComboboxFormDemo() {
  const [language, setLanguage] = createSignal('')
  const [framework, setFramework] = createSignal('')

  const summary = createMemo(() => {
    const parts: string[] = []
    if (language()) parts.push(language())
    if (framework()) parts.push(`with ${framework()}`)
    return parts.length > 0 ? parts.join(' ') : 'No selections yet'
  })

  return (
    <div className="space-y-4 max-w-sm">
      <h4 className="text-sm font-medium leading-none">Tech Stack</h4>
      <div className="grid gap-3">
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Language</span>
          <Combobox value={language()} onValueChange={setLanguage}>
            <ComboboxTrigger showPlaceholder={!language()}>
              <ComboboxValue placeholder="Select language..." />
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxInput placeholder="Search language..." />
              <ComboboxEmpty>No language found.</ComboboxEmpty>
              <ComboboxItem value="TypeScript" defaultSelected>TypeScript</ComboboxItem>
              <ComboboxItem value="JavaScript">JavaScript</ComboboxItem>
              <ComboboxItem value="Python">Python</ComboboxItem>
              <ComboboxItem value="Go">Go</ComboboxItem>
              <ComboboxItem value="Rust">Rust</ComboboxItem>
            </ComboboxContent>
          </Combobox>
        </div>
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Framework</span>
          <Combobox value={framework()} onValueChange={setFramework}>
            <ComboboxTrigger showPlaceholder={!framework()}>
              <ComboboxValue placeholder="Select framework..." />
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxInput placeholder="Search framework..." />
              <ComboboxEmpty>No framework found.</ComboboxEmpty>
              <ComboboxItem value="Next.js" defaultSelected>Next.js</ComboboxItem>
              <ComboboxItem value="Remix">Remix</ComboboxItem>
              <ComboboxItem value="Hono">Hono</ComboboxItem>
              <ComboboxItem value="FastAPI">FastAPI</ComboboxItem>
              <ComboboxItem value="Actix">Actix</ComboboxItem>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        Summary: <span className="summary-text font-medium">{summary()}</span>
      </div>
    </div>
  )
}

/**
 * Grouped combobox example
 * Timezone selector with searchable grouped options
 */
export function ComboboxGroupedDemo() {
  const [timezone, setTimezone] = createSignal('')

  return (
    <div className="space-y-3">
      <Combobox value={timezone()} onValueChange={setTimezone}>
        <ComboboxTrigger className="w-[320px]" showPlaceholder={!timezone()}>
          <ComboboxValue placeholder="Select timezone..." />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Search timezone..." />
          <ComboboxEmpty>No timezone found.</ComboboxEmpty>
          <ComboboxGroup heading="North America">
            <ComboboxItem value="est" defaultSelected>Eastern Standard Time (EST)</ComboboxItem>
            <ComboboxItem value="cst">Central Standard Time (CST)</ComboboxItem>
            <ComboboxItem value="mst">Mountain Standard Time (MST)</ComboboxItem>
            <ComboboxItem value="pst">Pacific Standard Time (PST)</ComboboxItem>
          </ComboboxGroup>
          <ComboboxSeparator />
          <ComboboxGroup heading="Europe">
            <ComboboxItem value="gmt">Greenwich Mean Time (GMT)</ComboboxItem>
            <ComboboxItem value="cet">Central European Time (CET)</ComboboxItem>
            <ComboboxItem value="eet">Eastern European Time (EET)</ComboboxItem>
          </ComboboxGroup>
          <ComboboxSeparator />
          <ComboboxGroup heading="Asia">
            <ComboboxItem value="ist">India Standard Time (IST)</ComboboxItem>
            <ComboboxItem value="cst_china">China Standard Time (CST)</ComboboxItem>
            <ComboboxItem value="jst">Japan Standard Time (JST)</ComboboxItem>
          </ComboboxGroup>
        </ComboboxContent>
      </Combobox>
      <p className="text-sm text-muted-foreground">
        Selected: <span className="selected-timezone font-medium">{timezone() || 'None'}</span>
      </p>
    </div>
  )
}
