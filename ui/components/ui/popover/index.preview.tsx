// Auto-generated preview. Customize by editing this file.
"use client"

import { createSignal } from '@barefootjs/client'
import { Popover, PopoverTrigger, PopoverContent } from '../popover'

export function Default() {
  const [open, setOpen] = createSignal(false)

  return (
    <Popover open={open()} onOpenChange={setOpen}>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>
        <p>Popover content here.</p>
      </PopoverContent>
    </Popover>
  )
}

