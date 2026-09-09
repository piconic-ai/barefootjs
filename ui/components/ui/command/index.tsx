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

import { createContext, useContext, createSignal, createMemo, createEffect, onCleanup } from '@barefootjs/client'
import {
  Dialog,
  DialogOverlay,
  DialogContent,
} from '../dialog'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { SearchIcon } from '../icon'

/**
 * One registered CommandItem. `value`/`keywords` are getters so the root's
 * filtered-list memo re-reads them on every recompute instead of caching
 * a mount-time snapshot.
 */
interface CommandItemEntry {
  el: HTMLElement
  /** The enclosing group root (resolved once, at registration), if any. */
  group: HTMLElement | null
  value: () => string
  keywords: () => string[] | undefined
}

// Context for Command → children state sharing
interface CommandContextValue {
  search: () => string
  onSearchChange: (value: string) => void
  selectedValue: () => string
  onSelect: (value: string) => void
  registerItem: (entry: CommandItemEntry) => void
  unregisterItem: (entry: CommandItemEntry) => void
  /** Every registered item, in document order (kept sorted at registration). */
  items: () => ReadonlyArray<CommandItemEntry>
  /** The registered items the current search keeps, in document order. */
  visibleItems: () => ReadonlyArray<CommandItemEntry>
  /** The registered items whose enclosing group root is `group`. */
  itemsInGroup: (group: HTMLElement) => ReadonlyArray<CommandItemEntry>
  /**
   * Whether `entry` survives the current search. Depends on `search` (and
   * the filter) only, never on the registry, so an item's own `hidden`
   * effect does not re-run when a sibling registers.
   */
  isVisible: (entry: CommandItemEntry) => boolean
}

/**
 * `Array.prototype.sort` comparator placing `a` before `b` when `a`
 * precedes it in the document. Two nodes not in one tree (a row not yet
 * attached) compare equal, so the sort keeps their registration order.
 */
function documentOrder(a: HTMLElement, b: HTMLElement): number {
  const pos = a.compareDocumentPosition(b)
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
  return 0
}

/**
 * Copy of `list` with `entry` inserted at its document-order position
 * (after any entry that compares equal, so registration order breaks
 * ties). Binary search: O(log n) DOM comparisons per registration, so
 * mounting n items costs O(n log n) comparisons overall rather than a
 * full re-sort per registration.
 */
function insertInDocumentOrder(list: ReadonlyArray<CommandItemEntry>, entry: CommandItemEntry): CommandItemEntry[] {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (documentOrder(list[mid].el, entry.el) <= 0) lo = mid + 1
    else hi = mid
  }
  const next = list.slice()
  next.splice(lo, 0, entry)
  return next
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
  // Item registry as a signal: every "which items are visible" answer
  // below (item `hidden`, group/empty visibility, auto-selection) is a
  // synchronous derivation of `entries` + `search`, so it settles inside
  // the same signal write instead of on a later animation frame. The old
  // rAF-deferred DOM queries left the group/empty `hidden` attributes and
  // `data-selected` one frame behind the item `hidden` writes — a race
  // any observer between the write and the frame could see (#2827).
  // Each registration is one signal write; what re-runs on it is bounded
  // to the list-level memos and the group/empty/selection effects (O(n)),
  // never the n per-item `hidden` effects — see `isVisible`.
  const [entries, setEntries] = createSignal<CommandItemEntry[]>([])

  const filterFn = createMemo(() => props.filter ?? ((value: string, search: string) => {
    if (!search) return true
    return value.toLowerCase().includes(search.toLowerCase())
  }))

  // The one filter decision, shared by the per-item `hidden` effect
  // (`isVisible`) and the list-level memo below.
  const matches = (entry: CommandItemEntry, s: string): boolean => filterFn()(entry.value(), s, entry.keywords())

  // `entries` is kept in document order at registration, so this is too.
  // (No Array.prototype.map projection anywhere in this file, on purpose:
  // a map call, even inside a comment, makes `needsTypeBasedDetection` in
  // `packages/jsx/src/analyzer.ts` build a TypeScript Program for the
  // file, which costs seconds of compile time.)
  const visibleItems = createMemo(() => {
    const s = search()
    return entries().filter(entry => matches(entry, s))
  })

  // Group root → its items, so a group's effect is O(own items) instead of
  // an O(all items) `contains` scan on every registration.
  const itemsByGroup = createMemo(() => {
    const byGroup = new Map<HTMLElement | null, CommandItemEntry[]>()
    for (const entry of entries()) {
      const list = byGroup.get(entry.group)
      if (list) list.push(entry)
      else byGroup.set(entry.group, [entry])
    }
    return byGroup
  })

  const handleMount = (el: HTMLElement) => {
    // Auto-select the first visible item whenever the filtered list changes
    createEffect(() => {
      const first = visibleItems()[0]
      setSelectedValue(first ? first.value() : '')
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
      registerItem: (entry: CommandItemEntry) => setEntries(prev => insertInDocumentOrder(prev, entry)),
      unregisterItem: (entry: CommandItemEntry) => setEntries(prev => prev.filter(e => e !== entry)),
      items: entries,
      visibleItems,
      itemsInGroup: (group: HTMLElement) => itemsByGroup().get(group) ?? [],
      isVisible: (entry: CommandItemEntry) => matches(entry, search()),
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

    // Derived from the root's filtered-list memo, so it settles in the
    // same signal write as the items' own `hidden` — no frame in between.
    createEffect(() => {
      el.hidden = ctx.visibleItems().length > 0
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

    // Hide the group if it has items but none survive the search. Reads
    // the root's registry + filter rather than querying the items' `hidden`
    // attributes, so it does not depend on running after the item effects.
    createEffect(() => {
      const own = ctx.itemsInGroup(el)
      el.hidden = own.length > 0 && !own.some(entry => ctx.isVisible(entry))
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

    const entry: CommandItemEntry = {
      el,
      group: el.closest('[data-slot="command-group"]') as HTMLElement | null,
      value: resolveValue,
      keywords: () => props.keywords,
    }
    ctx.registerItem(entry)
    onCleanup(() => ctx.unregisterItem(entry))

    // Visibility is the root's decision (the same `matches` the list-level
    // memo uses); this effect only mirrors it and tracks `search` alone.
    createEffect(() => {
      el.hidden = !ctx.isVisible(entry)
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
