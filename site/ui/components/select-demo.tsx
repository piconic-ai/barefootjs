"use client"
/**
 * SelectDemo Components
 *
 * Interactive demos for Select component.
 * Based on shadcn/ui patterns for practical use cases.
 */

import { createSignal, createMemo } from '@barefootjs/client'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@ui/components/ui/select'

/**
 * Basic select example
 * Fruit selector with placeholder, disabled item, and value display
 */
export function SelectBasicDemo() {
  const [value, setValue] = createSignal('')

  return (
    <div className="space-y-3">
      <Select value={value()} onValueChange={setValue}>
        <SelectTrigger className="w-[280px]" showPlaceholder={!value()}>
          <SelectValue placeholder="Select a fruit..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="blueberry" disabled>Blueberry</SelectItem>
          <SelectItem value="grape">Grape</SelectItem>
          <SelectItem value="pineapple">Pineapple</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        Selected: <span className="selected-value font-medium">{value() || 'None'}</span>
      </p>
    </div>
  )
}

/**
 * Form example with multiple selects
 * Developer profile form with framework, role, and experience selects
 */
export function SelectFormDemo() {
  const [framework, setFramework] = createSignal('')
  const [role, setRole] = createSignal('')
  const [experience, setExperience] = createSignal('')

  const summary = createMemo(() => {
    const parts: string[] = []
    if (role()) parts.push(role())
    if (framework()) parts.push(`using ${framework()}`)
    if (experience()) parts.push(`with ${experience()} experience`)
    return parts.length > 0 ? parts.join(' ') : 'No selections yet'
  })

  return (
    <div className="space-y-4 max-w-sm">
      <h4 className="text-sm font-medium leading-none">Developer Profile</h4>
      <div className="grid gap-3">
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Framework</span>
          <Select value={framework()} onValueChange={setFramework}>
            <SelectTrigger showPlaceholder={!framework()}>
              <SelectValue placeholder="Select framework..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Next.js">Next.js</SelectItem>
              <SelectItem value="Remix">Remix</SelectItem>
              <SelectItem value="Astro">Astro</SelectItem>
              <SelectItem value="Nuxt">Nuxt</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Role</span>
          <Select value={role()} onValueChange={setRole}>
            <SelectTrigger showPlaceholder={!role()}>
              <SelectValue placeholder="Select role..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Frontend Developer">Frontend Developer</SelectItem>
              <SelectItem value="Backend Developer">Backend Developer</SelectItem>
              <SelectItem value="Full Stack Developer">Full Stack Developer</SelectItem>
              <SelectItem value="Designer">Designer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <span className="text-sm text-muted-foreground">Experience</span>
          <Select value={experience()} onValueChange={setExperience}>
            <SelectTrigger showPlaceholder={!experience()}>
              <SelectValue placeholder="Select experience..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0-1 years">0-1 years</SelectItem>
              <SelectItem value="1-3 years">1-3 years</SelectItem>
              <SelectItem value="3-5 years">3-5 years</SelectItem>
              <SelectItem value="5+ years">5+ years</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="text-sm text-muted-foreground pt-2 border-t">
        Summary: <span className="summary-text font-medium">{summary()}</span>
      </div>
    </div>
  )
}

/**
 * Grouped select example
 * Timezone selector with grouped options and separators
 */
export function SelectGroupedDemo() {
  const [timezone, setTimezone] = createSignal('')

  return (
    <div className="space-y-3">
      <Select value={timezone()} onValueChange={setTimezone}>
        <SelectTrigger className="w-[280px]" showPlaceholder={!timezone()}>
          <SelectValue placeholder="Select timezone..." />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>North America</SelectLabel>
            <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
            <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
            <SelectItem value="mst">Mountain Standard Time (MST)</SelectItem>
            <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Europe</SelectLabel>
            <SelectItem value="gmt">Greenwich Mean Time (GMT)</SelectItem>
            <SelectItem value="cet">Central European Time (CET)</SelectItem>
            <SelectItem value="eet">Eastern European Time (EET)</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Asia</SelectLabel>
            <SelectItem value="ist">India Standard Time (IST)</SelectItem>
            <SelectItem value="cst_china">China Standard Time (CST)</SelectItem>
            <SelectItem value="jst">Japan Standard Time (JST)</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        Selected: <span className="selected-timezone font-medium">{timezone() || 'None'}</span>
      </p>
    </div>
  )
}
