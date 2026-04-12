"use client"

/**
 * Command Components
 *
 * A command menu with search and keyboard navigation.
 * Inspired by shadcn/ui Command (cmdk-based) with CSS variable theming support.
 *
 * State management uses createContext/useContext for parent-child communication.
 * Command root manages search/selected state, children consume via context.
 *
 * Features:
 * - Search filtering (case-insensitive substring by default)
 * - Arrow key navigation
 * - Enter to select
 * - Auto-selection of first visible item on search change
 * - CommandDialog wraps Command in Dialog for Cmd+K style usage
 * - Accessibility (role="listbox", role="option")
 *
 * @example Basic usage
 * ```tsx
 * <Command>
 *   <CommandInput placeholder="Type a command..." />
 *   <CommandList>
 *     <CommandEmpty>No results found.</CommandEmpty>
 *     <CommandGroup heading="Suggestions">
 *       <CommandItem>Calendar</CommandItem>
 *       <CommandItem>Search</CommandItem>
 *     </CommandGroup>
 *   </CommandList>
 * </Command>
 * ```
 */

import { createContext, useContext, createSignal, createMemo, createEffect } from '@barefootjs/client-runtime'
import {
  Dialog,
  DialogOverlay,
  DialogContent,
} from '../dialog'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { SearchIcon } from '../icon'

// Context for Command → children state sharing
interface CommandContextValue {
  search: () => string
  onSearchChange: (value: string) => void
  selectedValue: () => string
  onSelect: (value: string) => void
  registerItem: (el: HTMLElement) => void
  unregisterItem: (el: HTMLElement) => void
  filter: (value: string, search: string, keywords?: string[]) => boolean
}

const CommandContext = createContext<CommandContextValue>()

// CSS classes (aligned with shadcn/ui)
const commandRootClasses = 'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground'
const commandInputWrapperClasses = 'flex items-center border-b px-3'
const commandInputClasses = 'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50'
const commandListClasses = 'max-h-[300px] overflow-y-auto overflow-x-hidden'
const commandGroupClasses = 'overflow-hidden p-1 text-foreground [&_[data-slot=command-group-heading]]:px-2 [&_[data-slot=command-group-heading]]:py-1.5 [&_[data-slot=command-group-heading]]:text-xs [&_[data-slot=command-group-heading]]:font-medium [&_[data-slot=command-group-heading]]:text-muted-foreground'
const commandItemClasses = 'relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'
const commandEmptyClasses = 'py-6 text-center text-sm'
const commandSeparatorClasses = '-mx-1 h-px bg-border'
const commandShortcutClasses = 'ml-auto text-xs tracking-widest text-muted-foreground'

// CommandDialog classes
const commandDialogContentClasses = 'overflow-hidden p-0'
const commandDialogCommandClasses = '[&_[data-slot=command-input-wrapper]]:h-12'

// --- Props ---

interface CommandProps extends HTMLBaseAttributes {
  /** Custom filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Callback when an item is selected */
  onValueChange?: (value: string) => void
  /** Children */
  children?: Child
}

interface CommandInputProps extends HTMLBaseAttributes {
  /** Placeholder text */
  placeholder?: string
  /** Whether disabled */
  disabled?: boolean
}

interface CommandListProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}

interface CommandEmptyProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}

interface CommandGroupProps extends HTMLBaseAttributes {
  /** Group heading text */
  heading?: string
  /** Children */
  children?: Child
}

interface CommandItemProps extends HTMLBaseAttributes {
  /** Value for filtering and selection (defaults to textContent) */
  value?: string
  /** Keywords for search matching */
  keywords?: string[]
  /** Whether disabled */
  disabled?: boolean
  /** Callback when selected */
  onSelect?: (value: string) => void
  /** Children */
  children?: Child
}

interface CommandSeparatorProps extends HTMLBaseAttributes {
}

interface CommandShortcutProps extends HTMLBaseAttributes {
  /** Children */
  children?: Child
}

interface CommandDialogProps extends HTMLBaseAttributes {
  /** Whether the dialog is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Command filter function */
  filter?: (value: string, search: string, keywords?: string[]) => boolean
  /** Children */
  children?: Child
}

/**
 * Command root component.
 * Manages search state, selected item, and keyboard navigation.
 */
function Command(props: CommandProps) {
  const [search, setSearch] = createSignal('')
  const [selectedValue, setSelectedValue] = createSignal('')
  const items = new Set<HTMLElement>()

  const filterFn = createMemo(() => props.filter ?? ((value: string, search: string) => {
    if (!search) return true
    return value.toLowerCase().includes(search.toLowerCase())
  }))

  const handleMount = (el: HTMLElement) => {
    // Auto-select first visible item when search changes
    createEffect(() => {
      search() // track dependency
      // Use rAF to run after item effects have updated visibility
      requestAnimationFrame(() => {
        const visibleItems = Array.from(el.querySelectorAll('[data-slot="command-item"]:not([hidden])')) as HTMLElement[]
        if (visibleItems.length > 0) {
          const firstValue = visibleItems[0].getAttribute('data-value') ?? ''
          setSelectedValue(firstValue)
        } else {
          setSelectedValue('')
        }
      })
    })

    // Keyboard navigation
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      const visibleItems = Array.from(el.querySelectorAll('[data-slot="command-item"]:not([hidden])')) as HTMLElement[]
      if (visibleItems.length === 0) return

      const currentValue = selectedValue()
      const currentIndex = visibleItems.findIndex(item => item.getAttribute('data-value') === currentValue)

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const nextIndex = currentIndex < visibleItems.length - 1 ? currentIndex + 1 : 0
          const nextValue = visibleItems[nextIndex].getAttribute('data-value') ?? ''
          setSelectedValue(nextValue)
          visibleItems[nextIndex].scrollIntoView({ block: 'nearest' })
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleItems.length - 1
          const prevValue = visibleItems[prevIndex].getAttribute('data-value') ?? ''
          setSelectedValue(prevValue)
          visibleItems[prevIndex].scrollIntoView({ block: 'nearest' })
          break
        }
        case 'Enter': {
          e.preventDefault()
          const selected = visibleItems[currentIndex]
          if (selected && selected.getAttribute('data-disabled') !== 'true') {
            selected.click()
          }
          break
        }
      }
    })
  }

  return (
    <CommandContext.Provider value={{
      search,
      onSearchChange: setSearch,
      selectedValue,
      onSelect: (value: string) => {
        setSelectedValue(value)
        props.onValueChange?.(value)
      },
      registerItem: (el: HTMLElement) => items.add(el),
      unregisterItem: (el: HTMLElement) => items.delete(el),
      filter: filterFn(),
    }}>
      <div
        data-slot="command"
        id={props.id}
        className={`${commandRootClasses} ${props.className ?? ''}`}
        ref={handleMount}
      >
        {props.children}
      </div>
    </CommandContext.Provider>
  )
}

/**
 * Search input for the command menu.
 * Writes to context's onSearchChange.
 */
function CommandInput(props: CommandInputProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(CommandContext)
    const input = el.querySelector('input') as HTMLInputElement
    if (!input) return

    input.addEventListener('input', () => {
      ctx.onSearchChange(input.value)
    })

    // Keep input in sync with search state
    createEffect(() => {
      const val = ctx.search()
      if (input.value !== val) {
        input.value = val
      }
    })
  }

  return (
    <div
      data-slot="command-input-wrapper"
      className={commandInputWrapperClasses}
      ref={handleMount}
    >
      <SearchIcon className="mr-2 size-4 shrink-0 opacity-50" />
      <input
        data-slot="command-input"
        id={props.id}
        type="text"
        placeholder={props.placeholder}
        disabled={props.disabled ?? false}
        className={`${commandInputClasses} ${props.className ?? ''}`}
        autocomplete="off"
      />
    </div>
  )
}

/**
 * Scrollable container for command items and groups.
 */
function CommandList({ className = '', children, ...props }: CommandListProps) {
  return (
    <div
      data-slot="command-list"
      role="listbox"
      className={`${commandListClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * "No results" message. Auto-shows when no items are visible.
 */
function CommandEmpty(props: CommandEmptyProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(CommandContext)

    createEffect(() => {
      ctx.search() // track dependency
      // Check after items have updated their visibility
      requestAnimationFrame(() => {
        const list = el.closest('[data-slot="command-list"]') ?? el.closest('[data-slot="command"]')
        if (!list) return
        const visibleItems = list.querySelectorAll('[data-slot="command-item"]:not([hidden])')
        el.hidden = visibleItems.length > 0
      })
    })
  }

  return (
    <div
      data-slot="command-empty"
      id={props.id}
      hidden
      className={`${commandEmptyClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Group of related command items with an optional heading.
 * Auto-hides when all items within are filtered out.
 */
function CommandGroup(props: CommandGroupProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(CommandContext)

    createEffect(() => {
      ctx.search() // track dependency
      // Check after items have updated their visibility
      requestAnimationFrame(() => {
        const items = el.querySelectorAll('[data-slot="command-item"]')
        const visibleItems = el.querySelectorAll('[data-slot="command-item"]:not([hidden])')
        // Hide the group if it has items but none are visible
        el.hidden = items.length > 0 && visibleItems.length === 0
      })
    })
  }

  return (
    <div
      data-slot="command-group"
      id={props.id}
      role="group"
      className={`${commandGroupClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.heading && (
        <div data-slot="command-group-heading" aria-hidden="true">
          {props.heading}
        </div>
      )}
      {props.children}
    </div>
  )
}

/**
 * Individual selectable item in the command menu.
 * Self-filters based on search context. Shows data-selected highlight.
 */
function CommandItem(props: CommandItemProps) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(CommandContext)

    // Resolve value from prop or textContent
    const resolveValue = () => {
      return props.value ?? el.textContent?.trim() ?? ''
    }

    // Set data-value for keyboard nav
    const value = resolveValue()
    el.setAttribute('data-value', value)

    ctx.registerItem(el)

    // Self-filter based on search
    createEffect(() => {
      const s = ctx.search()
      const v = resolveValue()
      const visible = ctx.filter(v, s, props.keywords)
      el.hidden = !visible
    })

    // Selected state
    createEffect(() => {
      const isSelected = ctx.selectedValue() === resolveValue()
      el.setAttribute('data-selected', String(isSelected))
    })

    // Click handler
    el.addEventListener('click', () => {
      if (el.getAttribute('data-disabled') === 'true') return
      const v = resolveValue()
      ctx.onSelect(v)
      props.onSelect?.(v)
    })

    // Hover to select
    el.addEventListener('pointerenter', () => {
      if (el.getAttribute('data-disabled') === 'true') return
      const v = resolveValue()
      ctx.onSelect(v)
    })
  }

  const isDisabled = createMemo(() => props.disabled ?? false)

  return (
    <div
      data-slot="command-item"
      id={props.id}
      role="option"
      data-disabled={isDisabled() || undefined}
      data-selected="false"
      className={`${commandItemClasses} ${props.className ?? ''}`}
      ref={handleMount}
    >
      {props.children}
    </div>
  )
}

/**
 * Visual separator between command groups.
 */
function CommandSeparator({ className = '', ...props }: CommandSeparatorProps) {
  return (
    <div
      data-slot="command-separator"
      role="separator"
      className={`${commandSeparatorClasses} ${className}`}
      {...props}
    />
  )
}

/**
 * Keyboard shortcut label displayed alongside a command item.
 */
function CommandShortcut({ className = '', children, ...props }: CommandShortcutProps) {
  return (
    <span
      data-slot="command-shortcut"
      className={`${commandShortcutClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

/**
 * Command menu wrapped in a Dialog.
 * Provides a Cmd+K style command palette experience.
 */
function CommandDialog(props: CommandDialogProps) {
  return (
    <Dialog open={props.open ?? false} onOpenChange={props.onOpenChange ?? (() => {})}>
      <DialogOverlay />
      <DialogContent className={`${commandDialogContentClasses} max-w-lg p-0`}>
        <Command id={props.id} filter={props.filter} className={commandDialogCommandClasses}>
          {props.children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
  CommandDialog,
}
export type {
  CommandProps,
  CommandInputProps,
  CommandListProps,
  CommandEmptyProps,
  CommandGroupProps,
  CommandItemProps,
  CommandSeparatorProps,
  CommandShortcutProps,
  CommandDialogProps,
}
