/**
 * Component Catalog Page
 *
 * Visual card grid catalog at /components with tag-based filtering.
 * Each card shows a live-rendered component preview with the component name.
 * Ref: #517
 */

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'

// Tag definitions for filtering
export type ComponentTag = 'input' | 'display' | 'feedback' | 'navigation' | 'layout'

const tagLabels: Record<ComponentTag, string> = {
  input: 'Input',
  display: 'Display',
  feedback: 'Feedback',
  navigation: 'Navigation',
  layout: 'Layout',
}

interface CatalogEntry {
  slug: string
  title: string
  description: string
  tags: ComponentTag[]
  preview?: () => any
}

// Catalog data with inline previews for components that render well statically
const catalogEntries: CatalogEntry[] = [
  {
    slug: 'accordion',
    title: 'Accordion',
    description: 'Vertically collapsing content sections',
    tags: ['layout'],
  },
  {
    slug: 'alert',
    title: 'Alert',
    description: 'Callout for important content',
    tags: ['feedback'],
  },
  {
    slug: 'alert-dialog',
    title: 'Alert Dialog',
    description: 'Modal dialog for important confirmations',
    tags: ['feedback'],
  },
  {
    slug: 'aspect-ratio',
    title: 'Aspect Ratio',
    description: 'Content within a desired ratio',
    tags: ['display'],
  },
  {
    slug: 'avatar',
    title: 'Avatar',
    description: 'User profile image with fallback',
    tags: ['display'],
  },
  {
    slug: 'badge',
    title: 'Badge',
    description: 'Small status indicator labels',
    tags: ['display'],
    preview: () => (
      <div className="flex gap-2">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>
    ),
  },
  {
    slug: 'breadcrumb',
    title: 'Breadcrumb',
    description: 'Navigation hierarchy trail',
    tags: ['navigation'],
  },
  {
    slug: 'button',
    title: 'Button',
    description: 'Clickable actions with multiple variants',
    tags: ['input'],
    preview: () => (
      <div className="flex gap-2">
        <Button size="sm">Button</Button>
        <Button size="sm" variant="outline">Outline</Button>
      </div>
    ),
  },
  {
    slug: 'calendar',
    title: 'Calendar',
    description: 'Date picker with month navigation',
    tags: ['input'],
  },
  {
    slug: 'card',
    title: 'Card',
    description: 'Container for grouped content',
    tags: ['display'],
  },
  {
    slug: 'carousel',
    title: 'Carousel',
    description: 'Motion and swipe content slider',
    tags: ['display'],
  },
  {
    slug: 'checkbox',
    title: 'Checkbox',
    description: 'Toggle selection control',
    tags: ['input'],
    preview: () => (
      <div className="flex items-center gap-2">
        <Checkbox defaultChecked />
        <Label>Accept terms</Label>
      </div>
    ),
  },
  {
    slug: 'collapsible',
    title: 'Collapsible',
    description: 'Expandable content section',
    tags: ['layout'],
  },
  {
    slug: 'command',
    title: 'Command',
    description: 'Search and command menu',
    tags: ['navigation'],
  },
  {
    slug: 'combobox',
    title: 'Combobox',
    description: 'Autocomplete input with dropdown',
    tags: ['input'],
  },
  {
    slug: 'context-menu',
    title: 'Context Menu',
    description: 'Right-click menu at cursor position',
    tags: ['navigation'],
  },
  {
    slug: 'data-table',
    title: 'Data Table',
    description: 'Sortable, filterable data table',
    tags: ['display'],
  },
  {
    slug: 'date-picker',
    title: 'Date Picker',
    description: 'Date selection with calendar popup',
    tags: ['input'],
  },
  {
    slug: 'dialog',
    title: 'Dialog',
    description: 'Modal overlay with custom content',
    tags: ['feedback'],
  },
  {
    slug: 'drawer',
    title: 'Drawer',
    description: 'Slide-out panel from screen edge',
    tags: ['layout'],
  },
  {
    slug: 'dropdown-menu',
    title: 'Dropdown Menu',
    description: 'Action menu triggered by a button',
    tags: ['navigation'],
  },
  {
    slug: 'hover-card',
    title: 'Hover Card',
    description: 'Preview card on hover',
    tags: ['layout'],
  },
  {
    slug: 'input',
    title: 'Input',
    description: 'Text input field',
    tags: ['input'],
    preview: () => (
      <Input placeholder="Type something..." className="max-w-[180px]" />
    ),
  },
  {
    slug: 'input-otp',
    title: 'Input OTP',
    description: 'One-time password input',
    tags: ['input'],
  },
  {
    slug: 'label',
    title: 'Label',
    description: 'Accessible label for form controls',
    tags: ['input'],
    preview: () => (
      <Label>Email address</Label>
    ),
  },
  {
    slug: 'menubar',
    title: 'Menubar',
    description: 'Desktop application menu bar',
    tags: ['navigation'],
  },
  {
    slug: 'navigation-menu',
    title: 'Navigation Menu',
    description: 'Hover-activated navigation links',
    tags: ['navigation'],
  },
  {
    slug: 'pagination',
    title: 'Pagination',
    description: 'Page navigation controls',
    tags: ['navigation'],
  },
  {
    slug: 'popover',
    title: 'Popover',
    description: 'Floating content anchored to a trigger',
    tags: ['layout'],
  },
  {
    slug: 'portal',
    title: 'Portal',
    description: 'Renders content outside DOM hierarchy',
    tags: ['layout'],
  },
  {
    slug: 'progress',
    title: 'Progress',
    description: 'Task completion indicator bar',
    tags: ['feedback'],
    preview: () => (
      <Progress value={60} className="max-w-[180px]" />
    ),
  },
  {
    slug: 'radio-group',
    title: 'Radio Group',
    description: 'Single-select option group',
    tags: ['input'],
  },
  {
    slug: 'resizable',
    title: 'Resizable',
    description: 'Draggable resize panels',
    tags: ['layout'],
  },
  {
    slug: 'scroll-area',
    title: 'Scroll Area',
    description: 'Custom scrollbar container',
    tags: ['layout'],
  },
  {
    slug: 'select',
    title: 'Select',
    description: 'Dropdown selection control',
    tags: ['input'],
  },
  {
    slug: 'separator',
    title: 'Separator',
    description: 'Visual divider between content',
    tags: ['display'],
    preview: () => (
      <div className="space-y-2 w-full max-w-[180px]">
        <div className="text-xs text-muted-foreground">Section A</div>
        <Separator />
        <div className="text-xs text-muted-foreground">Section B</div>
      </div>
    ),
  },
  {
    slug: 'sidebar',
    title: 'Sidebar',
    description: 'Collapsible navigation panel',
    tags: ['layout', 'navigation'],
  },
  {
    slug: 'skeleton',
    title: 'Skeleton',
    description: 'Placeholder loading indicator',
    tags: ['feedback'],
    preview: () => (
      <div className="space-y-2 w-full max-w-[180px]">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    ),
  },
  {
    slug: 'sheet',
    title: 'Sheet',
    description: 'Side panel overlay',
    tags: ['layout'],
  },
  {
    slug: 'slider',
    title: 'Slider',
    description: 'Range value selector',
    tags: ['input'],
    preview: () => (
      <Slider defaultValue={50} className="max-w-[180px]" />
    ),
  },
  {
    slug: 'spinner',
    title: 'Spinner',
    description: 'Animated loading indicator',
    tags: ['feedback'],
    preview: () => (
      <Spinner />
    ),
  },
  {
    slug: 'switch',
    title: 'Switch',
    description: 'On/off toggle control',
    tags: ['input'],
    preview: () => (
      <div className="flex items-center gap-2">
        <Switch defaultChecked />
        <Label>Airplane mode</Label>
      </div>
    ),
  },
  {
    slug: 'table',
    title: 'Table',
    description: 'Responsive data table',
    tags: ['display'],
  },
  {
    slug: 'tabs',
    title: 'Tabs',
    description: 'Tabbed content navigation',
    tags: ['navigation'],
  },
  {
    slug: 'textarea',
    title: 'Textarea',
    description: 'Multi-line text input',
    tags: ['input'],
    preview: () => (
      <Textarea placeholder="Write a message..." className="max-w-[180px] h-16 text-xs" />
    ),
  },
  {
    slug: 'toast',
    title: 'Toast',
    description: 'Temporary notification message',
    tags: ['feedback'],
  },
  {
    slug: 'toggle',
    title: 'Toggle',
    description: 'Two-state pressed button',
    tags: ['input'],
    preview: () => (
      <Toggle size="sm">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
      </Toggle>
    ),
  },
  {
    slug: 'toggle-group',
    title: 'Toggle Group',
    description: 'Group of toggle buttons',
    tags: ['input'],
  },
  {
    slug: 'tooltip',
    title: 'Tooltip',
    description: 'Informational text on hover',
    tags: ['layout'],
  },
]

const allTags: ComponentTag[] = ['input', 'display', 'feedback', 'navigation', 'layout']

function TagChip({ tag, active }: { tag: string; active?: boolean }) {
  const base = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer'
  const cls = active
    ? `${base} bg-primary text-primary-foreground`
    : `${base} bg-secondary text-secondary-foreground hover:bg-secondary/80`
  return <span className={cls}>{tag}</span>
}

function ComponentCard({ entry }: { entry: CatalogEntry }) {
  const href = `/docs/components/${entry.slug}`
  return (
    <a
      href={href}
      className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline overflow-hidden"
    >
      {/* Preview area */}
      <div className="flex items-center justify-center p-6 min-h-[120px] bg-muted/30">
        {entry.preview ? (
          entry.preview()
        ) : (
          <span className="text-2xl font-semibold text-muted-foreground/40 select-none">
            {entry.title.charAt(0)}
          </span>
        )}
      </div>
      {/* Label area */}
      <div className="px-4 py-3 border-t border-border">
        <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">{entry.title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
      </div>
    </a>
  )
}

export function ComponentCatalogPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Components</h1>
        <p className="text-muted-foreground text-lg">
          Browse all components. Pick one, copy the code, make it yours.
        </p>
      </div>

      {/* Tag filter chips */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <TagChip tag="All" active />
        {allTags.map(tag => (
          <TagChip tag={tagLabels[tag]} />
        ))}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {catalogEntries.map(entry => (
          <ComponentCard entry={entry} />
        ))}
      </div>
    </div>
  )
}
