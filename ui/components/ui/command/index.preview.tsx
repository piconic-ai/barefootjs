// Auto-generated preview. Customize by editing this file.
"use client"

import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator, CommandShortcut, CommandDialog } from '../command'

export function Default() {
  return (
    <Command>
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem value="Calendar" defaultSelected>Calendar</CommandItem>
          <CommandItem>Search</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

