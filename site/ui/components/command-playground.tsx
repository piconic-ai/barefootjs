"use client"
/**
 * Command Props Playground
 *
 * Interactive playground for the Command component.
 * Allows tweaking placeholder and filter behavior with live preview.
 */

import { createSignal, createEffect } from '@barefootjs/dom'
import { CopyButton } from './copy-button'
import { hlPlain, hlTag, hlAttr, hlStr } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@ui/components/ui/command'

function highlightCommandJsx(placeholder: string, showShortcuts: boolean): string {
  return [
    `${hlPlain('&lt;')}${hlTag('Command')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('CommandInput')} ${hlAttr('placeholder')}${hlPlain('=')}${hlStr(`&quot;${placeholder}&quot;`)} ${hlPlain('/&gt;')}`,
    `  ${hlPlain('&lt;')}${hlTag('CommandList')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('CommandEmpty')}${hlPlain('&gt;')}No results found.${hlPlain('&lt;/')}${hlTag('CommandEmpty')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('CommandGroup')} ${hlAttr('heading')}${hlPlain('=')}${hlStr('&quot;Suggestions&quot;')}${hlPlain('&gt;')}`,
    `      ${hlPlain('&lt;')}${hlTag('CommandItem')}${hlPlain('&gt;')}Calendar${hlPlain('&lt;/')}${hlTag('CommandItem')}${hlPlain('&gt;')}`,
    `      ${hlPlain('&lt;')}${hlTag('CommandItem')}${hlPlain('&gt;')}Search Emoji${hlPlain('&lt;/')}${hlTag('CommandItem')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;/')}${hlTag('CommandGroup')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('CommandSeparator')} ${hlPlain('/&gt;')}`,
    `    ${hlPlain('&lt;')}${hlTag('CommandGroup')} ${hlAttr('heading')}${hlPlain('=')}${hlStr('&quot;Settings&quot;')}${hlPlain('&gt;')}`,
    showShortcuts
      ? `      ${hlPlain('&lt;')}${hlTag('CommandItem')}${hlPlain('&gt;')}Profile${hlPlain('&lt;')}${hlTag('CommandShortcut')}${hlPlain('&gt;')}\u2318P${hlPlain('&lt;/')}${hlTag('CommandShortcut')}${hlPlain('&gt;&lt;/')}${hlTag('CommandItem')}${hlPlain('&gt;')}`
      : `      ${hlPlain('&lt;')}${hlTag('CommandItem')}${hlPlain('&gt;')}Profile${hlPlain('&lt;/')}${hlTag('CommandItem')}${hlPlain('&gt;')}`,
    showShortcuts
      ? `      ${hlPlain('&lt;')}${hlTag('CommandItem')}${hlPlain('&gt;')}Settings${hlPlain('&lt;')}${hlTag('CommandShortcut')}${hlPlain('&gt;')}\u2318S${hlPlain('&lt;/')}${hlTag('CommandShortcut')}${hlPlain('&gt;&lt;/')}${hlTag('CommandItem')}${hlPlain('&gt;')}`
      : `      ${hlPlain('&lt;')}${hlTag('CommandItem')}${hlPlain('&gt;')}Settings${hlPlain('&lt;/')}${hlTag('CommandItem')}${hlPlain('&gt;')}`,
    `    ${hlPlain('&lt;/')}${hlTag('CommandGroup')}${hlPlain('&gt;')}`,
    `  ${hlPlain('&lt;/')}${hlTag('CommandList')}${hlPlain('&gt;')}`,
    `${hlPlain('&lt;/')}${hlTag('Command')}${hlPlain('&gt;')}`,
  ].join('\n')
}

function CommandPlayground(_props: {}) {
  const [showShortcuts, setShowShortcuts] = createSignal(true)

  const codeText = () => {
    const parts: string[] = []
    parts.push(`<Command>`)
    parts.push(`  <CommandInput placeholder="Type a command or search..." />`)
    parts.push(`  <CommandList>`)
    parts.push(`    <CommandEmpty>No results found.</CommandEmpty>`)
    parts.push(`    <CommandGroup heading="Suggestions">`)
    parts.push(`      <CommandItem>Calendar</CommandItem>`)
    parts.push(`      <CommandItem>Search Emoji</CommandItem>`)
    parts.push(`    </CommandGroup>`)
    parts.push(`    <CommandSeparator />`)
    parts.push(`    <CommandGroup heading="Settings">`)
    if (showShortcuts()) {
      parts.push(`      <CommandItem>Profile<CommandShortcut>\u2318P</CommandShortcut></CommandItem>`)
      parts.push(`      <CommandItem>Settings<CommandShortcut>\u2318S</CommandShortcut></CommandItem>`)
    } else {
      parts.push(`      <CommandItem>Profile</CommandItem>`)
      parts.push(`      <CommandItem>Settings</CommandItem>`)
    }
    parts.push(`    </CommandGroup>`)
    parts.push(`  </CommandList>`)
    parts.push(`</Command>`)
    return parts.join('\n')
  }

  createEffect(() => {
    const s = showShortcuts()
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) {
      codeEl.innerHTML = highlightCommandJsx('Type a command or search...', s)
    }
  })

  return (
    <PlaygroundLayout
      previewDataAttr="data-command-preview"
      previewContent={
        <Command className="rounded-lg border shadow-md md:min-w-[450px]">
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem value="Calendar">Calendar</CommandItem>
              <CommandItem value="Search Emoji">Search Emoji</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Settings">
              <CommandItem value="Profile">
                Profile
                {showShortcuts() ? <CommandShortcut>⌘P</CommandShortcut> : null}
              </CommandItem>
              <CommandItem value="Settings">
                Settings
                {showShortcuts() ? <CommandShortcut>⌘S</CommandShortcut> : null}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      }
      controls={<>
        <PlaygroundControl label="shortcuts">
          <Checkbox
            checked={showShortcuts()}
            onCheckedChange={setShowShortcuts}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { CommandPlayground }
