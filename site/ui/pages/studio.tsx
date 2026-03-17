/**
 * Studio Page — Interactive design system builder prototype
 *
 * Canvas-based layout inspired by whiteboard tools (Miro).
 * Full-viewport canvas with component groups as "islands",
 * floating token panel, zoom controls, and fixed export bar.
 *
 * Zoom in/out is implemented via CSS transform on the canvas.
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Combobox, ComboboxTrigger, ComboboxValue, ComboboxContent, ComboboxInput, ComboboxEmpty, ComboboxItem } from '@/components/ui/combobox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

// ─── Component Pattern Data ─────────────────────────────────

interface ComponentPattern {
  slug: string
  patterns: { title: string; render: () => any }[]
}

const componentPatterns: Record<string, ComponentPattern> = {
  'Button': {
    slug: 'button',
    patterns: [
      {
        title: 'Variants',
        render: () => (
          <div className="flex flex-wrap gap-1.5">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
        ),
      },
      {
        title: 'Sizes',
        render: () => (
          <div className="flex items-end gap-1.5">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
          </div>
        ),
      },
      {
        title: 'With Icon',
        render: () => (
          <div className="flex gap-1.5">
            <Button>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              Continue
            </Button>
            <Button variant="outline" size="icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            </Button>
          </div>
        ),
      },
      {
        title: 'Loading',
        render: () => (
          <Button disabled>
            <div className="h-3 w-3 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
            Please wait
          </Button>
        ),
      },
    ],
  },
  'Input': {
    slug: 'input',
    patterns: [
      { title: 'Default', render: () => <Input type="text" placeholder="Enter text..." /> },
      {
        title: 'With Label',
        render: () => (
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="name@example.com" />
          </div>
        ),
      },
      { title: 'Disabled', render: () => <Input type="text" placeholder="Disabled" disabled /> },
    ],
  },
  'Textarea': {
    slug: 'textarea',
    patterns: [
      { title: 'Default', render: () => <Textarea placeholder="Type your message..." /> },
      {
        title: 'With Label',
        render: () => (
          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea placeholder="Tell us about yourself" />
          </div>
        ),
      },
    ],
  },
  'Checkbox': {
    slug: 'checkbox',
    patterns: [
      {
        title: 'Default',
        render: () => (
          <div className="flex items-center gap-2">
            <Checkbox id="detail-cb" />
            <Label for="detail-cb">Accept terms</Label>
          </div>
        ),
      },
      {
        title: 'Checked',
        render: () => (
          <div className="flex items-center gap-2">
            <Checkbox id="detail-cb2" checked />
            <Label for="detail-cb2">Checked</Label>
          </div>
        ),
      },
      {
        title: 'Disabled',
        render: () => (
          <div className="flex items-center gap-2">
            <Checkbox id="detail-cb3" disabled />
            <Label for="detail-cb3">Disabled</Label>
          </div>
        ),
      },
    ],
  },
  'Switch': {
    slug: 'switch',
    patterns: [
      {
        title: 'Default',
        render: () => (
          <div className="flex items-center gap-2">
            <Switch id="detail-sw" />
            <Label for="detail-sw">Airplane Mode</Label>
          </div>
        ),
      },
      {
        title: 'Checked',
        render: () => (
          <div className="flex items-center gap-2">
            <Switch id="detail-sw2" checked />
            <Label for="detail-sw2">Enabled</Label>
          </div>
        ),
      },
    ],
  },
  'Slider': {
    slug: 'slider',
    patterns: [
      { title: 'Default', render: () => <Slider defaultValue={50} max={100} step={1} /> },
      { title: 'Low Value', render: () => <Slider defaultValue={25} max={100} step={1} /> },
    ],
  },
  'Toggle': {
    slug: 'toggle',
    patterns: [
      {
        title: 'Default',
        render: () => (
          <div className="flex gap-1.5">
            <Toggle aria-label="Toggle bold">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
            </Toggle>
            <Toggle variant="outline" aria-label="Toggle italic">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>
            </Toggle>
          </div>
        ),
      },
    ],
  },
  'Label': {
    slug: 'label',
    patterns: [
      { title: 'Default', render: () => <Label>Your email address</Label> },
    ],
  },
  'Card': {
    slug: 'card',
    patterns: [
      {
        title: 'Basic',
        render: () => (
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Card Description</CardDescription>
            </CardHeader>
          </Card>
        ),
      },
    ],
  },
  'Badge': {
    slug: 'badge',
    patterns: [
      {
        title: 'Variants',
        render: () => (
          <div className="flex flex-wrap gap-1.5">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        ),
      },
    ],
  },
  'Avatar': {
    slug: 'avatar',
    patterns: [
      {
        title: 'Initials',
        render: () => (
          <div className="flex gap-2">
            <Avatar><AvatarFallback>AB</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>CD</AvatarFallback></Avatar>
          </div>
        ),
      },
    ],
  },
  'Separator': {
    slug: 'separator',
    patterns: [
      { title: 'Horizontal', render: () => <Separator /> },
      {
        title: 'Vertical',
        render: () => (
          <div className="flex h-8 items-center gap-2">
            <span className="text-xs text-muted-foreground">Blog</span>
            <Separator orientation="vertical" />
            <span className="text-xs text-muted-foreground">Docs</span>
            <Separator orientation="vertical" />
            <span className="text-xs text-muted-foreground">Source</span>
          </div>
        ),
      },
    ],
  },
  'Alert': {
    slug: 'alert',
    patterns: [
      {
        title: 'Default',
        render: () => (
          <Alert>
            <AlertTitle>Heads up!</AlertTitle>
            <AlertDescription>You can add components to your app.</AlertDescription>
          </Alert>
        ),
      },
      {
        title: 'Destructive',
        render: () => (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Something went wrong.</AlertDescription>
          </Alert>
        ),
      },
    ],
  },
  'Skeleton': {
    slug: 'skeleton',
    patterns: [
      {
        title: 'Card Layout',
        render: () => (
          <div className="flex items-center space-x-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-[180px]" />
              <Skeleton className="h-3 w-[120px]" />
            </div>
          </div>
        ),
      },
    ],
  },
  'Spinner': {
    slug: 'spinner',
    patterns: [
      { title: 'Default', render: () => <Spinner /> },
    ],
  },
  'Progress': {
    slug: 'progress',
    patterns: [
      { title: '25%', render: () => <Progress value={25} /> },
      { title: '60%', render: () => <Progress value={60} /> },
      { title: '100%', render: () => <Progress value={100} /> },
    ],
  },
  'Tabs': {
    slug: 'tabs',
    patterns: [
      {
        title: 'Default',
        render: () => (
          <Tabs defaultValue="account">
            <TabsList>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="password">Password</TabsTrigger>
            </TabsList>
          </Tabs>
        ),
      },
      {
        title: 'Three Tabs',
        render: () => (
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>
          </Tabs>
        ),
      },
    ],
  },
  'Accordion': {
    slug: 'accordion',
    patterns: [
      {
        title: 'Default',
        render: () => (
          <Accordion>
            <AccordionItem value="item-1">
              <AccordionTrigger>Is it accessible?</AccordionTrigger>
              <AccordionContent>Yes. It adheres to the WAI-ARIA design pattern.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Is it styled?</AccordionTrigger>
              <AccordionContent>Yes. It comes with default styles.</AccordionContent>
            </AccordionItem>
          </Accordion>
        ),
      },
    ],
  },
  // ── Mock-only components (no real imports) ──
  'Select': { slug: 'select', patterns: [{ title: 'Select', render: () => <p className="text-xs italic text-muted-foreground">Dropdown selection control with search and multi-select support.</p> }] },
  'Radio Group': { slug: 'radio-group', patterns: [{ title: 'Radio Group', render: () => <p className="text-xs italic text-muted-foreground">A set of checkable buttons where only one can be checked at a time.</p> }] },
  'Calendar': { slug: 'calendar', patterns: [{ title: 'Calendar', render: () => <p className="text-xs italic text-muted-foreground">A date field component with calendar popup.</p> }] },
  'Date Picker': { slug: 'date-picker', patterns: [{ title: 'Date Picker', render: () => <p className="text-xs italic text-muted-foreground">A date picker with range and preset support.</p> }] },
  'Combobox': { slug: 'combobox', patterns: [{ title: 'Combobox', render: () => <p className="text-xs italic text-muted-foreground">Autocomplete input with searchable dropdown. Click the preview to try it.</p> }] },
  'Input OTP': { slug: 'input-otp', patterns: [{ title: 'Input OTP', render: () => <p className="text-xs italic text-muted-foreground">One-time password input with auto-advance.</p> }] },
  'Toggle Group': { slug: 'toggle-group', patterns: [{ title: 'Toggle Group', render: () => <p className="text-xs italic text-muted-foreground">A group of toggle buttons supporting single or multiple selection.</p> }] },
  'Table': { slug: 'table', patterns: [{ title: 'Table', render: () => <p className="text-xs italic text-muted-foreground">Responsive table with sorting and row selection.</p> }] },
  'Aspect Ratio': { slug: 'aspect-ratio', patterns: [{ title: 'Aspect Ratio', render: () => <p className="text-xs italic text-muted-foreground">Displays content within a fixed aspect ratio container.</p> }] },
  'Data Table': { slug: 'data-table', patterns: [{ title: 'Data Table', render: () => <p className="text-xs italic text-muted-foreground">Advanced table with pagination, sorting, and filtering.</p> }] },
  'Carousel': { slug: 'carousel', patterns: [{ title: 'Carousel', render: () => <p className="text-xs italic text-muted-foreground">A carousel with motion and swipe support.</p> }] },
  'Alert Dialog': { slug: 'alert-dialog', patterns: [{ title: 'Alert Dialog', render: () => <p className="text-xs italic text-muted-foreground">A modal dialog for important confirmations.</p> }] },
  'Dialog': { slug: 'dialog', patterns: [{ title: 'Dialog', render: () => <p className="text-xs italic text-muted-foreground">A modal overlay with focus trapping and backdrop.</p> }] },
  'Toast': { slug: 'toast', patterns: [{ title: 'Toast', render: () => <p className="text-xs italic text-muted-foreground">Temporary notification messages with auto-dismiss.</p> }] },
  'Breadcrumb': { slug: 'breadcrumb', patterns: [{ title: 'Breadcrumb', render: () => <p className="text-xs italic text-muted-foreground">Navigation breadcrumb trail with separator support.</p> }] },
  'Dropdown Menu': { slug: 'dropdown-menu', patterns: [{ title: 'Dropdown Menu', render: () => <p className="text-xs italic text-muted-foreground">Accessible dropdown menu with submenus and keyboard navigation.</p> }] },
  'Context Menu': { slug: 'context-menu', patterns: [{ title: 'Context Menu', render: () => <p className="text-xs italic text-muted-foreground">Right-click context menu with nested items.</p> }] },
  'Command': { slug: 'command', patterns: [{ title: 'Command', render: () => <p className="text-xs italic text-muted-foreground">Command palette with search and keyboard shortcuts.</p> }] },
  'Pagination': { slug: 'pagination', patterns: [{ title: 'Pagination', render: () => <p className="text-xs italic text-muted-foreground">Page navigation with previous/next and page numbers.</p> }] },
  'Menubar': { slug: 'menubar', patterns: [{ title: 'Menubar', render: () => <p className="text-xs italic text-muted-foreground">Horizontal menu bar with dropdown menus.</p> }] },
  'Navigation Menu': { slug: 'navigation-menu', patterns: [{ title: 'Navigation Menu', render: () => <p className="text-xs italic text-muted-foreground">Site navigation with mega-menu dropdown support.</p> }] },
  'Collapsible': { slug: 'collapsible', patterns: [{ title: 'Collapsible', render: () => <p className="text-xs italic text-muted-foreground">Expandable/collapsible content section.</p> }] },
  'Sheet': { slug: 'sheet', patterns: [{ title: 'Sheet', render: () => <p className="text-xs italic text-muted-foreground">Side panel overlay that slides in from the edge.</p> }] },
  'Drawer': { slug: 'drawer', patterns: [{ title: 'Drawer', render: () => <p className="text-xs italic text-muted-foreground">Bottom drawer with drag-to-dismiss gesture.</p> }] },
  'Popover': { slug: 'popover', patterns: [{ title: 'Popover', render: () => <p className="text-xs italic text-muted-foreground">Floating content panel with arrow pointer.</p> }] },
  'Tooltip': { slug: 'tooltip', patterns: [{ title: 'Tooltip', render: () => <p className="text-xs italic text-muted-foreground">Informational popup shown on hover or focus.</p> }] },
  'Hover Card': { slug: 'hover-card', patterns: [{ title: 'Hover Card', render: () => <p className="text-xs italic text-muted-foreground">Rich content preview on hover.</p> }] },
  'Scroll Area': { slug: 'scroll-area', patterns: [{ title: 'Scroll Area', render: () => <p className="text-xs italic text-muted-foreground">Custom scrollbar container with cross-browser support.</p> }] },
  'Resizable': { slug: 'resizable', patterns: [{ title: 'Resizable', render: () => <p className="text-xs italic text-muted-foreground">Resizable panel layout with drag handles.</p> }] },
  'Portal': { slug: 'portal', patterns: [{ title: 'Portal', render: () => <p className="text-xs italic text-muted-foreground">Renders children into a different part of the DOM tree.</p> }] },
}

// ─── Style Preset Data ───────────────────────────────────────
//
// Presets define the structural skeleton: spacing, radius, shadow depth, and font.
// Colors are a separate concern — users customize them independently.

interface StylePreset {
  name: string
  description: string
  spacing: string
  radius: string
  shadow: {
    sm: string
    default: string
    md: string
    lg: string
  }
  font: string
}

const defaultColors = {
  background:              { light: 'oklch(1 0 0)',               dark: 'oklch(0.145 0 0)' },
  foreground:              { light: 'oklch(0.145 0 0)',           dark: 'oklch(0.985 0 0)' },
  card:                    { light: 'oklch(1 0 0)',               dark: 'oklch(0.205 0 0)' },
  'card-foreground':       { light: 'oklch(0.145 0 0)',           dark: 'oklch(0.985 0 0)' },
  primary:                 { light: 'oklch(0.205 0 0)',           dark: 'oklch(0.35 0 0)' },
  'primary-foreground':    { light: 'oklch(0.985 0 0)',           dark: 'oklch(0.985 0 0)' },
  secondary:               { light: 'oklch(0.97 0 0)',            dark: 'oklch(0.269 0 0)' },
  'secondary-foreground':  { light: 'oklch(0.205 0 0)',           dark: 'oklch(0.985 0 0)' },
  muted:                   { light: 'oklch(0.97 0 0)',            dark: 'oklch(0.269 0 0)' },
  'muted-foreground':      { light: 'oklch(0.556 0 0)',           dark: 'oklch(0.708 0 0)' },
  accent:                  { light: 'oklch(0.97 0 0)',            dark: 'oklch(0.269 0 0)' },
  'accent-foreground':     { light: 'oklch(0.205 0 0)',           dark: 'oklch(0.985 0 0)' },
  destructive:             { light: 'oklch(0.577 0.245 27.325)',  dark: 'oklch(0.704 0.191 22.216)' },
  'destructive-foreground':{ light: 'oklch(0.985 0 0)',           dark: 'oklch(0.985 0 0)' },
  border:                  { light: 'oklch(0.922 0 0)',           dark: 'oklch(1 0 0 / 10%)' },
  input:                   { light: 'oklch(0.922 0 0)',           dark: 'oklch(1 0 0 / 15%)' },
  ring:                    { light: 'oklch(0.708 0 0)',           dark: 'oklch(0.556 0 0)' },
}

const stylePresets: StylePreset[] = [
  {
    name: 'Default',
    description: 'The classic shadcn/ui look. Clean and familiar.',
    spacing: '0.25rem',
    radius: '0.625rem',
    shadow: {
      sm:      '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      default: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      md:      '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      lg:      '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    },
    font: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
  },
  {
    name: 'Sharp',
    description: 'Boxy and sharp. Pairs well with mono fonts.',
    spacing: '0.25rem',
    radius: '0',
    shadow: {
      sm:      '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      default: '0 1px 2px 0 rgb(0 0 0 / 0.06)',
      md:      '0 2px 4px -1px rgb(0 0 0 / 0.08)',
      lg:      '0 4px 8px -2px rgb(0 0 0 / 0.1)',
    },
    font: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  {
    name: 'Soft',
    description: 'Soft and rounded, with generous spacing.',
    spacing: '0.3rem',
    radius: '1rem',
    shadow: {
      sm:      '0 1px 3px 0 rgb(0 0 0 / 0.06)',
      default: '0 2px 6px 0 rgb(0 0 0 / 0.08), 0 1px 3px -1px rgb(0 0 0 / 0.06)',
      md:      '0 6px 12px -2px rgb(0 0 0 / 0.08), 0 3px 6px -3px rgb(0 0 0 / 0.06)',
      lg:      '0 12px 24px -4px rgb(0 0 0 / 0.08), 0 6px 10px -5px rgb(0 0 0 / 0.06)',
    },
    font: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
  },
  {
    name: 'Compact',
    description: 'Dense layout for data-heavy interfaces.',
    spacing: '0.2rem',
    radius: '0.375rem',
    shadow: {
      sm:      'none',
      default: 'none',
      md:      'none',
      lg:      '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    },
    font: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
  },
]

// ─── Inline SVG icons ───────────────────────────────────────

function IconZoomIn() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  )
}
function IconZoomOut() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  )
}
function IconFitView() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}
function IconSettings() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function IconCopy() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}
// ─── Token Panel (floating) ─────────────────────────────────

function ColorSwatch({ name }: { name: string }) {
  return (
    <div>
      <button
        className="flex items-center gap-2 py-0.5 w-full text-left hover:bg-muted/50 rounded-sm px-0.5 -mx-0.5 transition-colors"
        data-studio-color-edit={name}
      >
        <div className="w-3.5 h-3.5 rounded-sm border border-border shrink-0" style={{ backgroundColor: `var(--${name})` }} data-studio-color-preview={name} />
        <span className="text-[11px] font-mono text-foreground">--{name}</span>
      </button>
      {/* Inline color editor — hidden by default */}
      <div className="hidden pl-1 pr-0.5 pb-1.5 pt-1 space-y-1" data-studio-color-editor={name}>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-5 h-5 rounded border border-border shrink-0" style={{ backgroundColor: `var(--${name})` }} data-studio-color-editor-preview={name} />
          <input
            type="text"
            className="flex-1 text-[10px] font-mono text-muted-foreground bg-transparent border-b border-border focus:border-ring focus:outline-none px-0.5 py-0"
            data-studio-color-text={name}
            placeholder="#000000"
          />
          <button className="text-[8px] font-mono text-muted-foreground hover:text-foreground px-1 py-0.5 rounded border border-border transition-colors" data-studio-color-mode={name}>
            RGB
          </button>
        </div>
        {/* OKLCH sliders — hidden by default */}
        <div className="hidden" data-studio-sliders-oklch={name}>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground w-5 shrink-0">L</span>
            <input type="range" min="0" max="1" step="0.005" className="flex-1 h-1 accent-primary" data-studio-slider-l={name} />
            <span className="text-[9px] font-mono text-muted-foreground w-7 text-right" data-studio-label-l={name} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground w-5 shrink-0">C</span>
            <input type="range" min="0" max="0.4" step="0.005" className="flex-1 h-1 accent-primary" data-studio-slider-c={name} />
            <span className="text-[9px] font-mono text-muted-foreground w-7 text-right" data-studio-label-c={name} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground w-5 shrink-0">H</span>
            <input type="range" min="0" max="360" step="1" className="flex-1 h-1 accent-primary" data-studio-slider-h={name} />
            <span className="text-[9px] font-mono text-muted-foreground w-7 text-right" data-studio-label-h={name} />
          </div>
        </div>
        {/* RGB sliders */}
        <div data-studio-sliders-rgb={name}>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground w-5 shrink-0">R</span>
            <input type="range" min="0" max="255" step="1" className="flex-1 h-1 accent-primary" data-studio-slider-r={name} />
            <span className="text-[9px] font-mono text-muted-foreground w-7 text-right" data-studio-label-r={name} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground w-5 shrink-0">G</span>
            <input type="range" min="0" max="255" step="1" className="flex-1 h-1 accent-primary" data-studio-slider-g={name} />
            <span className="text-[9px] font-mono text-muted-foreground w-7 text-right" data-studio-label-g={name} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground w-5 shrink-0">B</span>
            <input type="range" min="0" max="255" step="1" className="flex-1 h-1 accent-primary" data-studio-slider-b={name} />
            <span className="text-[9px] font-mono text-muted-foreground w-7 text-right" data-studio-label-b={name} />
          </div>
        </div>
      </div>
    </div>
  )
}

function TokenPanel() {
  return (
    <div className="w-60 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-1.5">
          <IconSettings />
          <span className="text-xs font-medium text-foreground">Tokens</span>
        </div>
      </div>

      <div className="p-3 space-y-3 max-h-[calc(100vh-16rem)] overflow-y-auto">
        {/* Style Presets — compact: show selected, dropdown on hover */}
        <div className="relative" data-studio-style-container>
          <button className="w-full flex items-center justify-between px-2 py-1.5 rounded-md border border-border hover:border-ring transition-colors" data-studio-style-trigger>
            <div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Style</span>
              <div className="text-[11px] font-medium text-foreground" data-studio-style-label>Default</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className="text-muted-foreground"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div className="hidden absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-border bg-card shadow-lg" data-studio-style-dropdown>
            {stylePresets.map((preset, i) => (
              <button
                className={`w-full text-left px-2 py-1.5 transition-colors first:rounded-t-md last:rounded-b-md hover:bg-accent ${
                  i === 0 ? 'bg-accent/50' : ''
                }`}
                data-studio-preset={preset.name}
              >
                <div className="text-[11px] font-medium text-foreground">{preset.name}</div>
                <div className="text-[9px] text-muted-foreground">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Font — below style, dropdown opens downward with room */}
        <div className="relative" data-studio-font-container>
          <button className="w-full flex items-center justify-between px-2 py-1.5 rounded-md border border-border hover:border-ring transition-colors" data-studio-font-trigger>
            <div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Font</span>
              <div className="text-[11px] font-medium text-foreground" data-studio-font-label>System Default</div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" className="text-muted-foreground"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div className="hidden absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-border bg-card shadow-lg" data-studio-font-dropdown>
            {[
              { key: 'system', name: 'System Default', desc: 'OS native font stack', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
              { key: 'inter', name: 'Inter', desc: 'Clean and neutral', family: '"Inter", sans-serif' },
              { key: 'noto-sans', name: 'Noto Sans', desc: 'Universal coverage', family: '"Noto Sans", sans-serif' },
              { key: 'nunito-sans', name: 'Nunito Sans', desc: 'Friendly and rounded', family: '"Nunito Sans", sans-serif' },
              { key: 'figtree', name: 'Figtree', desc: 'Modern geometric', family: '"Figtree", sans-serif' },
            ].map(f => (
              <button className="w-full flex items-center justify-between text-left px-2 py-1.5 transition-colors first:rounded-t-md last:rounded-b-md hover:bg-accent" data-studio-font={f.key}>
                <div>
                  <div className="text-[11px] font-medium text-foreground" style={{ fontFamily: f.family }}>{f.name}</div>
                  <div className="text-[9px] text-muted-foreground">{f.desc}</div>
                </div>
                <span className="hidden text-[9px] text-muted-foreground shrink-0" data-studio-font-check={f.key}>&#10003;</span>
              </button>
            ))}
          </div>
        </div>

        {/* Spacing */}
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Spacing</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground" data-studio-spacing-label>0.25rem</span>
          </div>
          <div className="flex items-center gap-1.5 pt-0.5">
            <input type="range" min="0.15" max="0.4" step="0.01" className="flex-1 h-1 accent-primary" data-studio-spacing-slider />
          </div>
        </div>

        {/* Colors */}
        <div className="space-y-0.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Colors</span>
          <ColorSwatch name="primary" />
          <ColorSwatch name="secondary" />
          <ColorSwatch name="accent" />
          <ColorSwatch name="destructive" />
          <ColorSwatch name="background" />
          <ColorSwatch name="foreground" />
          <ColorSwatch name="muted" />
          <ColorSwatch name="border" />
        </div>

        {/* Radius */}
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Radius</span>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 border-2 border-foreground bg-muted" style={{ borderRadius: 'var(--radius)' }} />
            <span className="text-[11px] font-mono text-muted-foreground" data-studio-radius-label>0.625rem</span>
          </div>
          <div className="flex items-center gap-1.5 pt-0.5">
            <input type="range" min="0" max="1.5" step="0.125" className="flex-1 h-1 accent-primary" data-studio-radius-slider />
          </div>
        </div>

      </div>

      {/* Reset — bottom, separated by border */}
      <div className="hidden border-t border-border px-3 py-2" data-studio-reset-container>
        <button className="w-full text-[10px] text-muted-foreground hover:text-destructive transition-colors text-center" data-studio-reset>
          Reset all customizations
        </button>
      </div>
    </div>
  )
}

// ─── Component Preview Item ─────────────────────────────────

function PreviewItem({ name, children }: { name: string; children: any }) {
  return (
    <div className="group rounded-md px-2 pt-1 pb-2 min-w-0 overflow-hidden hover:bg-muted/50 transition-colors">
      {/* Label — clickable to open detail */}
      <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-1 truncate block text-left" data-studio-detail={name}>
        {name}
      </button>
      {/* Preview */}
      <div className="flex items-center justify-center min-h-8 min-w-0">
        {children}
      </div>
    </div>
  )
}

// ─── Component Detail Panel (slide-in) ──────────────────────

function DetailPanel() {
  return (
    <div className="fixed top-14 right-0 bottom-0 w-96 bg-card border-l border-border shadow-xl z-30 hidden" data-studio-detail-panel>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground" data-studio-detail-title>Component</h2>
        <button className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" data-studio-detail-close title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      {/* Pre-rendered content blocks — one per component, toggled by script */}
      <div className="overflow-y-auto h-full" data-studio-detail-content>
        {Object.entries(componentPatterns).map(([name, { slug, patterns }]) => (
          <div className="hidden p-4 space-y-4" data-studio-detail-for={name}>
            <div className="space-y-2">
              <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Patterns</h3>
              {patterns.map(p => (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <div className="text-xs font-medium text-foreground">{p.title}</div>
                  {p.render()}
                </div>
              ))}
            </div>
            <a href={`/components/${slug}`} target="_blank" rel="noopener" className="text-[11px] text-muted-foreground hover:text-foreground no-underline hover:underline transition-colors">
              View full documentation &rarr;
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Component Group Island ─────────────────────────────────

function GroupIsland({ title, children }: { title: string; children: any }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border/60 bg-muted/20 p-3">
      <h2 className="text-xs font-semibold text-foreground mb-2">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {children}
      </div>
    </div>
  )
}

// ─── Canvas content ─────────────────────────────────────────

function CanvasContent() {
  return (
    <div className="space-y-4 p-4 lg:pl-68">
      {/* Input & Form Controls */}
      <GroupIsland title="Input & Form Controls">
        <PreviewItem name="Button">
          <div className="flex flex-wrap gap-1">
            <Button size="sm">Primary</Button>
            <Button variant="outline" size="sm">Outline</Button>
            <Button variant="secondary" size="sm">Secondary</Button>
            <Button variant="destructive" size="sm">Destructive</Button>
          </div>
        </PreviewItem>

        <PreviewItem name="Input">
          <Input type="text" placeholder="name@example.com" className="h-7 text-[11px]" />
        </PreviewItem>

        <PreviewItem name="Textarea">
          <Textarea placeholder="Write a message..." className="text-[11px] h-10 resize-none" />
        </PreviewItem>

        <PreviewItem name="Checkbox">
          <div className="flex items-center gap-1.5">
            <Checkbox defaultChecked />
            <Label className="text-[11px]">Accept terms</Label>
          </div>
        </PreviewItem>

        <PreviewItem name="Switch">
          <div className="flex items-center gap-1.5">
            <Switch defaultChecked />
            <Label className="text-[11px]">Active</Label>
          </div>
        </PreviewItem>

        <PreviewItem name="Select">
          <Select>
            <SelectTrigger className="h-7 text-[11px] w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </PreviewItem>

        <PreviewItem name="Radio Group">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full border-2 border-primary flex items-center justify-center"><div className="h-1 w-1 rounded-full bg-primary" /></div>
              <span className="text-[11px] text-foreground">Option A</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full border-2 border-input" />
              <span className="text-[11px] text-foreground">Option B</span>
            </div>
          </div>
        </PreviewItem>

        <PreviewItem name="Slider">
          <Slider defaultValue={40} className="w-full" />
        </PreviewItem>

        <PreviewItem name="Toggle">
          <Toggle variant="outline" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
          </Toggle>
        </PreviewItem>

        <PreviewItem name="Label">
          <Label className="text-[11px]">Email address</Label>
        </PreviewItem>

        <PreviewItem name="Calendar">
          <div className="text-[11px] text-muted-foreground">March 2026</div>
        </PreviewItem>

        <PreviewItem name="Date Picker">
          <div className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-muted-foreground">
            Pick a date
          </div>
        </PreviewItem>

        <PreviewItem name="Combobox">
          <Combobox>
            <ComboboxTrigger className="h-7 text-[11px] w-full">
              <ComboboxValue placeholder="Select..." />
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxInput placeholder="Search..." />
              <ComboboxEmpty>No results.</ComboboxEmpty>
              <ComboboxItem value="react">React</ComboboxItem>
              <ComboboxItem value="vue">Vue</ComboboxItem>
              <ComboboxItem value="svelte">Svelte</ComboboxItem>
            </ComboboxContent>
          </Combobox>
        </PreviewItem>

        <PreviewItem name="Input OTP">
          <div className="flex gap-1">
            <div className="w-6 h-7 rounded border border-input bg-background flex items-center justify-center text-[11px] font-mono">1</div>
            <div className="w-6 h-7 rounded border border-input bg-background flex items-center justify-center text-[11px] font-mono">2</div>
            <div className="w-6 h-7 rounded border border-input bg-background flex items-center justify-center text-[11px] font-mono text-muted-foreground">_</div>
            <div className="w-6 h-7 rounded border border-input bg-background" />
          </div>
        </PreviewItem>

        <PreviewItem name="Toggle Group">
          <div className="flex">
            <button className="rounded-l-md border border-input bg-muted px-2 py-1 text-[11px]">B</button>
            <button className="border-y border-input px-2 py-1 text-[11px]">I</button>
            <button className="rounded-r-md border border-input px-2 py-1 text-[11px]">U</button>
          </div>
        </PreviewItem>
      </GroupIsland>

      {/* Display & Data */}
      <GroupIsland title="Display & Data">
        <PreviewItem name="Card">
          <Card className="w-full">
            <CardHeader className="p-2 space-y-0.5">
              <CardTitle className="text-[11px]">Settings</CardTitle>
              <CardDescription className="text-[10px]">Manage preferences.</CardDescription>
            </CardHeader>
          </Card>
        </PreviewItem>

        <PreviewItem name="Badge">
          <div className="flex gap-1">
            <Badge className="text-[9px] px-1.5 py-0.5">Default</Badge>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5">Secondary</Badge>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">Outline</Badge>
          </div>
        </PreviewItem>

        <PreviewItem name="Avatar">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10px]">AB</AvatarFallback>
          </Avatar>
        </PreviewItem>

        <PreviewItem name="Table">
          <div className="w-full text-[10px]">
            <div className="flex border-b border-border py-0.5 font-medium text-muted-foreground"><span className="flex-1">Name</span><span className="w-12 text-right">Status</span></div>
            <div className="flex py-0.5 text-foreground"><span className="flex-1">Proj A</span><span className="w-12 text-right">Active</span></div>
            <div className="flex py-0.5 text-foreground"><span className="flex-1">Proj B</span><span className="w-12 text-right">Draft</span></div>
          </div>
        </PreviewItem>

        <PreviewItem name="Separator">
          <div className="w-full space-y-1.5">
            <div className="text-[10px] text-muted-foreground">Section A</div>
            <Separator />
            <div className="text-[10px] text-muted-foreground">Section B</div>
          </div>
        </PreviewItem>

        <PreviewItem name="Aspect Ratio">
          <div className="w-14 h-8 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">16:9</div>
        </PreviewItem>

        <PreviewItem name="Data Table">
          <div className="text-[10px] text-muted-foreground italic">Sortable table</div>
        </PreviewItem>

        <PreviewItem name="Carousel">
          <div className="text-[10px] text-muted-foreground italic">Content slider</div>
        </PreviewItem>

        <PreviewItem name="Skeleton">
          <div className="w-full space-y-1">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-3/4" />
            <Skeleton className="h-2 w-1/2" />
          </div>
        </PreviewItem>
      </GroupIsland>

      {/* Feedback */}
      <GroupIsland title="Feedback">
        <PreviewItem name="Alert">
          <Alert className="w-full py-2 px-2">
            <AlertTitle className="text-[11px]">Heads up!</AlertTitle>
            <AlertDescription className="text-[10px]">Something to know.</AlertDescription>
          </Alert>
        </PreviewItem>

        <PreviewItem name="Alert Dialog">
          <div className="text-[10px] text-muted-foreground italic">Confirmation modal</div>
        </PreviewItem>

        <PreviewItem name="Dialog">
          <div className="text-[10px] text-muted-foreground italic">Modal overlay</div>
        </PreviewItem>

        <PreviewItem name="Toast">
          <div className="w-full rounded border border-border bg-background p-2 shadow-sm">
            <div className="text-[11px] font-medium text-foreground">Saved</div>
          </div>
        </PreviewItem>

        <PreviewItem name="Progress">
          <Progress value={60} className="w-full h-1" />
        </PreviewItem>

        <PreviewItem name="Spinner">
          <Spinner className="h-4 w-4" />
        </PreviewItem>
      </GroupIsland>

      {/* Navigation */}
      <GroupIsland title="Navigation">
        <PreviewItem name="Tabs">
          <Tabs defaultValue="account" className="w-full">
            <TabsList className="h-7">
              <TabsTrigger value="account" className="text-[11px] px-2 py-0.5">Account</TabsTrigger>
              <TabsTrigger value="password" className="text-[11px] px-2 py-0.5">Password</TabsTrigger>
            </TabsList>
          </Tabs>
        </PreviewItem>

        <PreviewItem name="Breadcrumb">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-muted-foreground">Home</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Button</span>
          </div>
        </PreviewItem>

        <PreviewItem name="Dropdown Menu">
          <div className="text-[10px] text-muted-foreground italic">Action menu</div>
        </PreviewItem>

        <PreviewItem name="Context Menu">
          <div className="text-[10px] text-muted-foreground italic">Right-click menu</div>
        </PreviewItem>

        <PreviewItem name="Command">
          <div className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-muted-foreground">
            Search...
          </div>
        </PreviewItem>

        <PreviewItem name="Pagination">
          <div className="flex items-center gap-0.5">
            <div className="px-1.5 py-0.5 text-[10px] rounded border border-input text-muted-foreground">&lt;</div>
            <div className="px-1.5 py-0.5 text-[10px] rounded bg-primary text-primary-foreground">1</div>
            <div className="px-1.5 py-0.5 text-[10px] rounded border border-input text-muted-foreground">2</div>
            <div className="px-1.5 py-0.5 text-[10px] rounded border border-input text-muted-foreground">3</div>
            <div className="px-1.5 py-0.5 text-[10px] rounded border border-input text-muted-foreground">&gt;</div>
          </div>
        </PreviewItem>

        <PreviewItem name="Menubar">
          <div className="flex gap-1 text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-muted text-foreground">File</span>
            <span className="px-1.5 py-0.5 text-muted-foreground">Edit</span>
            <span className="px-1.5 py-0.5 text-muted-foreground">View</span>
          </div>
        </PreviewItem>

        <PreviewItem name="Navigation Menu">
          <div className="text-[10px] text-muted-foreground italic">Hover nav</div>
        </PreviewItem>
      </GroupIsland>

      {/* Layout & Overlay */}
      <GroupIsland title="Layout & Overlay">
        <PreviewItem name="Accordion">
          <Accordion className="w-full">
            <AccordionItem value="a11y" open>
              <AccordionTrigger className="text-[11px] py-1">Is it accessible?</AccordionTrigger>
              <AccordionContent className="text-[10px] pb-1">Yes, WAI-ARIA.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </PreviewItem>

        <PreviewItem name="Collapsible">
          <div className="text-[10px] text-muted-foreground italic">Expandable</div>
        </PreviewItem>

        <PreviewItem name="Sheet">
          <div className="text-[10px] text-muted-foreground italic">Side panel</div>
        </PreviewItem>

        <PreviewItem name="Drawer">
          <div className="text-[10px] text-muted-foreground italic">Slide-out</div>
        </PreviewItem>

        <PreviewItem name="Popover">
          <div className="text-[10px] text-muted-foreground italic">Floating</div>
        </PreviewItem>

        <PreviewItem name="Tooltip">
          <div className="px-1.5 py-0.5 rounded bg-foreground text-background text-[10px]">Tooltip</div>
        </PreviewItem>

        <PreviewItem name="Hover Card">
          <div className="text-[10px] text-muted-foreground italic">Preview</div>
        </PreviewItem>

        <PreviewItem name="Scroll Area">
          <div className="text-[10px] text-muted-foreground italic">Scrollbar</div>
        </PreviewItem>

        <PreviewItem name="Resizable">
          <div className="text-[10px] text-muted-foreground italic">Resize</div>
        </PreviewItem>

        <PreviewItem name="Portal">
          <div className="text-[10px] text-muted-foreground italic">Outside DOM</div>
        </PreviewItem>
      </GroupIsland>
    </div>
  )
}

// ─── Zoom Controls ──────────────────────────────────────────

function ZoomControls() {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card shadow-md p-1">
      <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" data-studio-zoom="out" title="Zoom out">
        <IconZoomOut />
      </button>
      <span className="px-2 text-xs font-mono text-muted-foreground min-w-10 text-center" data-studio-zoom-label>100%</span>
      <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" data-studio-zoom="in" title="Zoom in">
        <IconZoomIn />
      </button>
      <div className="w-px h-4 bg-border mx-0.5" />
      <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" data-studio-zoom="fit" title="Fit to view">
        <IconFitView />
      </button>
    </div>
  )
}

// ─── Export Bar (fixed bottom) ──────────────────────────────

function ExportBar() {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2 bg-card border-t border-border">
      <code className="rounded-md bg-muted border border-border px-3 py-1.5 font-mono text-[11px] text-foreground max-w-xl truncate">
        barefoot init --from "https://ui.barefootjs.dev/studio?c=eJx..."
      </code>
      <button className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0">
        <IconCopy />
        Copy
      </button>
    </div>
  )
}

// ─── Detail Panel Script ────────────────────────────────────

const detailScript = `
(function() {
  var panel = document.querySelector('[data-studio-detail-panel]');
  var titleEl = document.querySelector('[data-studio-detail-title]');
  var closeBtn = document.querySelector('[data-studio-detail-close]');

  // Open detail panel
  document.addEventListener('click', function(e) {
    var trigger = e.target.closest('[data-studio-detail]');
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();
    var name = trigger.getAttribute('data-studio-detail');
    titleEl.textContent = name;
    // Hide all content blocks, show matching one
    var blocks = panel.querySelectorAll('[data-studio-detail-for]');
    blocks.forEach(function(b) { b.classList.add('hidden'); });
    var target = panel.querySelector('[data-studio-detail-for="' + name + '"]');
    if (target) target.classList.remove('hidden');
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
  });

  // Close
  closeBtn.addEventListener('click', function() {
    panel.style.display = 'none';
  });

  // Close on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && panel.style.display !== 'none') {
      panel.style.display = 'none';
    }
  });
})();
`

// ─── Zoom Script ────────────────────────────────────────────

const zoomScript = `
(function() {
  var scale = 1;
  var panX = 0;
  var panY = 0;
  var MIN_SCALE = 0.25;
  var MAX_SCALE = 2;
  var steps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  var canvas = document.querySelector('[data-studio-canvas]');
  var viewport = document.querySelector('[data-studio-viewport]');
  var label = document.querySelector('[data-studio-zoom-label]');

  function applyTransform(animate) {
    canvas.style.transition = animate ? 'transform 0.2s ease' : 'none';
    canvas.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
    canvas.style.transformOrigin = 'top center';
    label.textContent = Math.round(scale * 100) + '%';
  }

  function snapToStep(s) {
    return steps.reduce(function(prev, curr) {
      return Math.abs(curr - s) < Math.abs(prev - s) ? curr : prev;
    });
  }

  function stepZoom(direction) {
    var snapped = snapToStep(scale);
    var idx = steps.indexOf(snapped);
    if (direction > 0 && idx < steps.length - 1) scale = steps[idx + 1];
    else if (direction < 0 && idx > 0) scale = steps[idx - 1];
    applyTransform(true);
  }

  // Button zoom
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-studio-zoom]');
    if (!btn) return;
    var action = btn.getAttribute('data-studio-zoom');
    if (action === 'in') stepZoom(1);
    else if (action === 'out') stepZoom(-1);
    else if (action === 'fit') { scale = 1; panX = 0; panY = 0; applyTransform(true); }
  });

  // Cmd/Ctrl + wheel zoom — accumulate delta, trigger on threshold
  var wheelAccum = 0;
  var WHEEL_THRESHOLD = 40;
  var wheelTimer = null;
  viewport.addEventListener('wheel', function(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    wheelAccum += e.deltaY;
    if (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
      stepZoom(wheelAccum < 0 ? 1 : -1);
      wheelAccum = 0;
    }
    // Reset accumulator after idle
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(function() { wheelAccum = 0; }, 300);
  }, { passive: false });

  // Click-drag panning
  var isPanning = false;
  var startX = 0;
  var startY = 0;
  var startPanX = 0;
  var startPanY = 0;

  viewport.addEventListener('mousedown', function(e) {
    // Don't pan when clicking on interactive elements
    if (e.target.closest('button, input, textarea, select, a, label, [data-studio-zoom]')) return;
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = panX;
    startPanY = panY;
    viewport.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isPanning) return;
    panX = startPanX + (e.clientX - startX);
    panY = startPanY + (e.clientY - startY);
    applyTransform(false);
  });

  document.addEventListener('mouseup', function() {
    if (!isPanning) return;
    isPanning = false;
    viewport.style.cursor = '';
  });

  // Set default cursor on viewport
  viewport.style.cursor = 'grab';
})();
`

// ─── Studio Script (Presets + Token Editing) ────────────────

// Serialize data for the client script
const stylePresetsJson = JSON.stringify(stylePresets)
const defaultColorsJson = JSON.stringify(defaultColors)

const studioScript = `
(function() {
  var STORAGE_KEY = 'barefootjs-studio-tokens';
  var stylePresets = ${stylePresetsJson};
  var defaultColors = ${defaultColorsJson};
  var activeStyle = 'Default';
  var customTokens = {};

  // ── localStorage persistence ──
  // Track custom overrides (null = use preset value)
  var customSpacing = null;
  var customRadius = null;
  var customFont = null;

  var fontOptions = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
    inter: '"Inter", sans-serif',
    'noto-sans': '"Noto Sans", sans-serif',
    'nunito-sans': '"Nunito Sans", sans-serif',
    figtree: '"Figtree", sans-serif'
  };

  // Google Fonts to load on demand
  var googleFonts = {
    inter: 'Inter:wght@400;500;600;700',
    'noto-sans': 'Noto+Sans:wght@400;500;600;700',
    'nunito-sans': 'Nunito+Sans:wght@400;500;600;700',
    figtree: 'Figtree:wght@400;500;600;700'
  };
  var loadedFonts = {};

  function loadGoogleFont(key) {
    if (loadedFonts[key] || !googleFonts[key]) return;
    loadedFonts[key] = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + googleFonts[key] + '&display=swap';
    document.head.appendChild(link);
  }

  function saveToStorage() {
    try {
      var data = {
        style: activeStyle,
        tokens: customTokens,
        spacing: customSpacing,
        radius: customRadius,
        font: customFont
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch(e) {}
    updateResetButton();
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data.tokens) customTokens = data.tokens;
      if (data.style) activeStyle = data.style;
      if (data.spacing) customSpacing = data.spacing;
      if (data.radius) customRadius = data.radius;
      if (data.font) customFont = data.font;
    } catch(e) {}
  }

  function hasCustomizations() {
    return Object.keys(customTokens).length > 0 || activeStyle !== 'Default'
      || customSpacing !== null || customRadius !== null || customFont !== null;
  }

  function updateResetButton() {
    var container = document.querySelector('[data-studio-reset-container]');
    if (!container) return;
    if (hasCustomizations()) {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  }

  function isDark() {
    return document.documentElement.classList.contains('dark');
  }

  function getMode() {
    return isDark() ? 'dark' : 'light';
  }

  // ── Color conversion utilities ──

  function parseOklch(str) {
    var m = str.match(/oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)/);
    if (!m) return { l: 0.5, c: 0, h: 0 };
    return { l: parseFloat(m[1]), c: parseFloat(m[2]), h: parseFloat(m[3]) };
  }

  function buildOklch(l, c, h) {
    return 'oklch(' + l.toFixed(3) + ' ' + c.toFixed(3) + ' ' + h + ')';
  }

  // OKLCH → sRGB (approximate via OKLab intermediate)
  function oklchToRgb(l, c, h) {
    var hRad = h * Math.PI / 180;
    var a = c * Math.cos(hRad);
    var b = c * Math.sin(hRad);
    // OKLab → linear sRGB
    var l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = l - 0.0894841775 * a - 1.2914855480 * b;
    l_ = l_ * l_ * l_; m_ = m_ * m_ * m_; s_ = s_ * s_ * s_;
    var r = +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
    var g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
    var bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_;
    // Linear → sRGB gamma
    function gamma(x) { return x >= 0.0031308 ? 1.055 * Math.pow(x, 1/2.4) - 0.055 : 12.92 * x; }
    return {
      r: Math.round(Math.max(0, Math.min(255, gamma(r) * 255))),
      g: Math.round(Math.max(0, Math.min(255, gamma(g) * 255))),
      b: Math.round(Math.max(0, Math.min(255, gamma(bl) * 255)))
    };
  }

  // sRGB → OKLCH
  function rgbToOklch(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    // sRGB gamma → linear
    function linearize(x) { return x >= 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92; }
    r = linearize(r); g = linearize(g); b = linearize(b);
    // Linear sRGB → OKLab
    var l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    var A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    var B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    var C = Math.sqrt(A * A + B * B);
    var H = Math.atan2(B, A) * 180 / Math.PI;
    if (H < 0) H += 360;
    return { l: Math.max(0, Math.min(1, L)), c: Math.max(0, C), h: Math.round(H) };
  }

  // Parse hex (#rgb or #rrggbb) or rgb() string to {r, g, b}
  function parseColorText(str) {
    str = str.trim();
    // Hex
    var hex = str.match(/^#?([0-9a-f]{3,8})$/i);
    if (hex) {
      var h = hex[1];
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      if (h.length >= 6) {
        return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
      }
    }
    // rgb(r, g, b)
    var rgb = str.match(/rgb\\w?\\(\\s*(\\d+)[\\s,]+(\\d+)[\\s,]+(\\d+)/);
    if (rgb) return { r: parseInt(rgb[1]), g: parseInt(rgb[2]), b: parseInt(rgb[3]) };
    // oklch(l c h)
    var ok = str.match(/oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)/);
    if (ok) return oklchToRgb(parseFloat(ok[1]), parseFloat(ok[2]), parseFloat(ok[3]));
    return null;
  }

  function rgbToHex(r, g, b) {
    return '#' + [r,g,b].map(function(v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  // Per-editor color mode tracking ('oklch' or 'rgb')
  var editorModes = {};

  // ── Get current color token value (custom > default) ──
  function getTokenValue(token, mode) {
    if (customTokens[token] && customTokens[token][mode]) {
      return customTokens[token][mode];
    }
    return defaultColors[token] ? defaultColors[token][mode] : 'oklch(0.5 0 0)';
  }

  // ── Update style label and dropdown highlight ──
  function updateStyleButtons() {
    var label = document.querySelector('[data-studio-style-label]');
    if (label) label.textContent = activeStyle;

    var buttons = document.querySelectorAll('[data-studio-preset]');
    buttons.forEach(function(btn) {
      var name = btn.getAttribute('data-studio-preset');
      if (name === activeStyle) {
        btn.classList.add('bg-accent/50');
      } else {
        btn.classList.remove('bg-accent/50');
      }
    });
  }

  // ── Apply style preset (radius + shadow + font) ──
  function applyStyle(name) {
    var preset = stylePresets.find(function(p) { return p.name === name; });
    if (!preset) return;

    activeStyle = name;
    customSpacing = null;
    customRadius = null;
    customFont = null;
    var root = document.documentElement;

    // Spacing
    if (name === 'Default') {
      root.style.removeProperty('--spacing');
    } else {
      root.style.setProperty('--spacing', preset.spacing);
    }

    // Radius
    if (name === 'Default') {
      root.style.removeProperty('--radius');
    } else {
      root.style.setProperty('--radius', preset.radius);
    }

    // Shadows
    var shadowKeys = ['sm', 'default', 'md', 'lg'];
    var shadowVars = ['--shadow-sm', '--shadow', '--shadow-md', '--shadow-lg'];
    if (name === 'Default') {
      shadowVars.forEach(function(v) { root.style.removeProperty(v); });
    } else {
      shadowKeys.forEach(function(key, i) {
        root.style.setProperty(shadowVars[i], preset.shadow[key]);
      });
    }

    // Font
    if (name === 'Default') {
      root.style.removeProperty('--font-sans');
    } else {
      root.style.setProperty('--font-sans', preset.font);
    }
    updateFontChecks();

    // Update spacing label + slider
    var spacingLabel = document.querySelector('[data-studio-spacing-label]');
    if (spacingLabel) spacingLabel.textContent = preset.spacing;
    var spacingSlider = document.querySelector('[data-studio-spacing-slider]');
    if (spacingSlider) spacingSlider.value = parseFloat(preset.spacing);

    // Update radius label + slider
    var radiusLabel = document.querySelector('[data-studio-radius-label]');
    if (radiusLabel) radiusLabel.textContent = preset.radius;
    var radiusSlider = document.querySelector('[data-studio-radius-slider]');
    if (radiusSlider) radiusSlider.value = parseFloat(preset.radius);

    // Re-apply custom color tokens (preserve across style changes)
    reapplyForMode();

    updateStyleButtons();
    saveToStorage();
  }

  // ── Re-apply color overrides for current mode (dark/light toggle) ──
  function reapplyForMode() {
    var root = document.documentElement;
    var mode = getMode();

    // Re-apply custom color tokens for the new mode
    Object.keys(customTokens).forEach(function(token) {
      if (customTokens[token][mode]) {
        root.style.setProperty('--' + token, customTokens[token][mode]);
      }
    });

    // Update any open editor to show the new mode's values
    document.querySelectorAll('[data-studio-color-editor]').forEach(function(ed) {
      if (ed.classList.contains('hidden')) return;
      var token = ed.getAttribute('data-studio-color-editor');
      updateEditorSliders(token);
    });
  }

  // ── Update editor sliders to match current token value ──
  function updateEditorSliders(token) {
    var mode = getMode();
    var val = getTokenValue(token, mode);
    var parsed = parseOklch(val);

    // OKLCH sliders
    var sliderL = document.querySelector('[data-studio-slider-l="' + token + '"]');
    var sliderC = document.querySelector('[data-studio-slider-c="' + token + '"]');
    var sliderH = document.querySelector('[data-studio-slider-h="' + token + '"]');
    var labelL = document.querySelector('[data-studio-label-l="' + token + '"]');
    var labelC = document.querySelector('[data-studio-label-c="' + token + '"]');
    var labelH = document.querySelector('[data-studio-label-h="' + token + '"]');

    if (sliderL) sliderL.value = parsed.l;
    if (sliderC) sliderC.value = parsed.c;
    if (sliderH) sliderH.value = parsed.h;
    if (labelL) labelL.textContent = parsed.l.toFixed(3);
    if (labelC) labelC.textContent = parsed.c.toFixed(3);
    if (labelH) labelH.textContent = Math.round(parsed.h);

    // RGB sliders
    var rgb = oklchToRgb(parsed.l, parsed.c, parsed.h);
    var sliderR = document.querySelector('[data-studio-slider-r="' + token + '"]');
    var sliderG = document.querySelector('[data-studio-slider-g="' + token + '"]');
    var sliderB = document.querySelector('[data-studio-slider-b="' + token + '"]');
    var labelR = document.querySelector('[data-studio-label-r="' + token + '"]');
    var labelG = document.querySelector('[data-studio-label-g="' + token + '"]');
    var labelB = document.querySelector('[data-studio-label-b="' + token + '"]');

    if (sliderR) sliderR.value = rgb.r;
    if (sliderG) sliderG.value = rgb.g;
    if (sliderB) sliderB.value = rgb.b;
    if (labelR) labelR.textContent = rgb.r;
    if (labelG) labelG.textContent = rgb.g;
    if (labelB) labelB.textContent = rgb.b;

    // Text input — show hex in RGB mode, oklch string otherwise
    var textInput = document.querySelector('[data-studio-color-text="' + token + '"]');
    if (textInput) {
      var edMode = editorModes[token] || 'rgb';
      textInput.value = edMode === 'rgb' ? rgbToHex(rgb.r, rgb.g, rgb.b) : val;
    }

    // Color previews
    var previews = document.querySelectorAll('[data-studio-color-editor-preview="' + token + '"]');
    previews.forEach(function(el) { el.style.backgroundColor = val; });
  }

  // ── Click on ColorSwatch → toggle editor ──
  document.addEventListener('click', function(e) {
    var trigger = e.target.closest('[data-studio-color-edit]');
    if (!trigger) return;
    e.preventDefault();
    var token = trigger.getAttribute('data-studio-color-edit');
    var editor = document.querySelector('[data-studio-color-editor="' + token + '"]');
    if (!editor) return;

    var isHidden = editor.classList.contains('hidden');

    // Close all editors first
    document.querySelectorAll('[data-studio-color-editor]').forEach(function(ed) {
      ed.classList.add('hidden');
    });

    if (isHidden) {
      editor.classList.remove('hidden');
      updateEditorSliders(token);
    }
  });

  // ── Slider input → update token ──
  document.addEventListener('input', function(e) {
    var slider = e.target;
    var token = null;
    var component = null;

    // Check which slider type
    if (slider.hasAttribute('data-studio-slider-l')) {
      token = slider.getAttribute('data-studio-slider-l');
      component = 'l';
    } else if (slider.hasAttribute('data-studio-slider-c')) {
      token = slider.getAttribute('data-studio-slider-c');
      component = 'c';
    } else if (slider.hasAttribute('data-studio-slider-h')) {
      token = slider.getAttribute('data-studio-slider-h');
      component = 'h';
    } else if (slider.hasAttribute('data-studio-spacing-slider')) {
      // Spacing slider
      var val = parseFloat(slider.value);
      var spacingVal = val + 'rem';
      document.documentElement.style.setProperty('--spacing', spacingVal);
      var spacingLabel = document.querySelector('[data-studio-spacing-label]');
      if (spacingLabel) spacingLabel.textContent = spacingVal;
      customSpacing = spacingVal;
      saveToStorage();
      return;
    } else if (slider.hasAttribute('data-studio-slider-r')) {
      token = slider.getAttribute('data-studio-slider-r');
      component = 'r';
    } else if (slider.hasAttribute('data-studio-slider-g')) {
      token = slider.getAttribute('data-studio-slider-g');
      component = 'g';
    } else if (slider.hasAttribute('data-studio-slider-b')) {
      token = slider.getAttribute('data-studio-slider-b');
      component = 'b';
    } else if (slider.hasAttribute('data-studio-radius-slider')) {
      // Radius slider
      var val = parseFloat(slider.value);
      var radiusVal = val + 'rem';
      document.documentElement.style.setProperty('--radius', radiusVal);
      var radiusLabel = document.querySelector('[data-studio-radius-label]');
      if (radiusLabel) radiusLabel.textContent = radiusVal;
      customRadius = radiusVal;
      saveToStorage();
      return;
    } else {
      return;
    }

    var mode = getMode();
    var currentVal = getTokenValue(token, mode);
    var newVal;

    if (component === 'r' || component === 'g' || component === 'b') {
      // RGB slider → convert current value to RGB, update one channel, convert back
      var parsed = parseOklch(currentVal);
      var rgb = oklchToRgb(parsed.l, parsed.c, parsed.h);
      if (component === 'r') rgb.r = parseInt(slider.value);
      if (component === 'g') rgb.g = parseInt(slider.value);
      if (component === 'b') rgb.b = parseInt(slider.value);
      var oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);
      newVal = buildOklch(oklch.l, oklch.c, oklch.h);
    } else {
      // OKLCH slider
      var parsed = parseOklch(currentVal);
      if (component === 'l') parsed.l = parseFloat(slider.value);
      if (component === 'c') parsed.c = parseFloat(slider.value);
      if (component === 'h') parsed.h = parseFloat(slider.value);
      newVal = buildOklch(parsed.l, parsed.c, parsed.h);
    }

    // Store in customTokens
    if (!customTokens[token]) {
      customTokens[token] = {};
      var otherMode = mode === 'light' ? 'dark' : 'light';
      customTokens[token][otherMode] = getTokenValue(token, otherMode);
    }
    customTokens[token][mode] = newVal;

    // Apply immediately
    document.documentElement.style.setProperty('--' + token, newVal);

    // Update all sliders and labels for this token
    updateEditorSliders(token);
    saveToStorage();
  });

  // ── Dropdown management (style + font) ──
  var styleDropdown = document.querySelector('[data-studio-style-dropdown]');
  var fontDropdown = document.querySelector('[data-studio-font-dropdown]');

  function closeAllDropdowns() {
    styleDropdown && styleDropdown.classList.add('hidden');
    fontDropdown && fontDropdown.classList.add('hidden');
  }

  document.addEventListener('click', function(e) {
    // ── Style trigger ──
    if (e.target.closest('[data-studio-style-trigger]')) {
      e.preventDefault();
      var wasHidden = styleDropdown && styleDropdown.classList.contains('hidden');
      closeAllDropdowns();
      if (wasHidden) styleDropdown.classList.remove('hidden');
      return;
    }

    // ── Style preset item ──
    var presetBtn = e.target.closest('[data-studio-preset]');
    if (presetBtn) {
      applyStyle(presetBtn.getAttribute('data-studio-preset'));
      closeAllDropdowns();
      return;
    }

    // ── Font trigger ──
    if (e.target.closest('[data-studio-font-trigger]')) {
      e.preventDefault();
      var wasHidden = fontDropdown && fontDropdown.classList.contains('hidden');
      closeAllDropdowns();
      if (wasHidden) fontDropdown.classList.remove('hidden');
      return;
    }

    // ── Font item ──
    var fontBtn = e.target.closest('[data-studio-font]');
    if (fontBtn) {
      e.preventDefault();
      var key = fontBtn.getAttribute('data-studio-font');
      var value = fontOptions[key];
      if (!value) return;
      loadGoogleFont(key);
      customFont = key;
      document.documentElement.style.setProperty('--font-sans', value);
      updateFontChecks();
      saveToStorage();
      closeAllDropdowns();
      return;
    }

    // ── Click outside any dropdown → close all ──
    if (!e.target.closest('[data-studio-style-container]') && !e.target.closest('[data-studio-font-container]')) {
      closeAllDropdowns();
    }
  });

  // ── Mode toggle (OKLCH ↔ RGB) ──
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-studio-color-mode]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var token = btn.getAttribute('data-studio-color-mode');
    var current = editorModes[token] || 'rgb';
    var next = current === 'oklch' ? 'rgb' : 'oklch';
    editorModes[token] = next;

    // Update button label
    btn.textContent = next.toUpperCase();

    // Toggle slider visibility
    var oklchGroup = document.querySelector('[data-studio-sliders-oklch="' + token + '"]');
    var rgbGroup = document.querySelector('[data-studio-sliders-rgb="' + token + '"]');
    if (oklchGroup && rgbGroup) {
      if (next === 'rgb') {
        oklchGroup.classList.add('hidden');
        rgbGroup.classList.remove('hidden');
      } else {
        oklchGroup.classList.remove('hidden');
        rgbGroup.classList.add('hidden');
      }
    }

    // Update text input format
    updateEditorSliders(token);
  });

  // ── Text input → parse and apply color ──
  document.addEventListener('change', function(e) {
    var input = e.target.closest('[data-studio-color-text]');
    if (!input) return;
    var token = input.getAttribute('data-studio-color-text');
    var text = input.value.trim();
    if (!text) return;

    var rgb = parseColorText(text);
    if (!rgb) return; // Invalid input — ignore

    var oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);
    var newVal = buildOklch(oklch.l, oklch.c, oklch.h);

    var mode = getMode();
    if (!customTokens[token]) {
      customTokens[token] = {};
      var otherMode = mode === 'light' ? 'dark' : 'light';
      customTokens[token][otherMode] = getTokenValue(token, otherMode);
    }
    customTokens[token][mode] = newVal;

    document.documentElement.style.setProperty('--' + token, newVal);
    updateEditorSliders(token);
    saveToStorage();
  });

  // ── Font label names ──
  var fontNames = {
    system: 'System Default',
    inter: 'Inter',
    'noto-sans': 'Noto Sans',
    'nunito-sans': 'Nunito Sans',
    figtree: 'Figtree'
  };

  function getActiveFont() {
    var current = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim();
    var keys = Object.keys(fontOptions);
    for (var i = 0; i < keys.length; i++) {
      if (current === fontOptions[keys[i]]) return keys[i];
    }
    return 'system';
  }

  function updateFontChecks() {
    var active = customFont || getActiveFont();
    // Update label
    var label = document.querySelector('[data-studio-font-label]');
    if (label) label.textContent = fontNames[active] || 'System Default';
    // Update check marks
    document.querySelectorAll('[data-studio-font-check]').forEach(function(el) {
      var key = el.getAttribute('data-studio-font-check');
      if (key === active) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  }


  // ── Reset button ──
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-studio-reset]');
    if (!btn) return;
    e.preventDefault();

    // Build description of what will be reset
    var parts = [];
    if (Object.keys(customTokens).length > 0) {
      parts.push(Object.keys(customTokens).length + ' color token(s)');
    }
    if (customSpacing !== null) parts.push('spacing');
    if (customRadius !== null) parts.push('radius');
    if (customFont !== null) parts.push('font');
    if (activeStyle !== 'Default') parts.push('style preset');

    var msg = parts.length > 0
      ? parts.join(', ') + ' will be reset. Continue?'
      : 'Reset all customizations?';

    if (!confirm(msg)) return;

    // Clear all customizations
    customTokens = {};
    customSpacing = null;
    customRadius = null;
    customFont = null;

    // Remove all inline style overrides for color tokens
    Object.keys(defaultColors).forEach(function(token) {
      document.documentElement.style.removeProperty('--' + token);
    });

    // Close all open editors
    document.querySelectorAll('[data-studio-color-editor]').forEach(function(ed) {
      ed.classList.add('hidden');
    });

    // Apply Default style (also removes spacing/radius/shadow/font overrides)
    applyStyle('Default');

    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    updateResetButton();
  });

  // ── Dark mode toggle → re-apply ──
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.attributeName === 'class') {
        reapplyForMode();
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // ── Initialize: restore from localStorage ──
  loadFromStorage();

  if (activeStyle !== 'Default') {
    applyStyle(activeStyle);
  }

  // Apply custom spacing/radius overrides (on top of preset)
  if (customSpacing !== null) {
    document.documentElement.style.setProperty('--spacing', customSpacing);
    var spacingLabel = document.querySelector('[data-studio-spacing-label]');
    if (spacingLabel) spacingLabel.textContent = customSpacing;
    var spacingSlider = document.querySelector('[data-studio-spacing-slider]');
    if (spacingSlider) spacingSlider.value = parseFloat(customSpacing);
  } else {
    var spacingSlider = document.querySelector('[data-studio-spacing-slider]');
    if (spacingSlider) {
      var preset = stylePresets.find(function(p) { return p.name === activeStyle; }) || stylePresets[0];
      spacingSlider.value = parseFloat(preset.spacing);
    }
  }

  if (customRadius !== null) {
    document.documentElement.style.setProperty('--radius', customRadius);
    var radiusLabel = document.querySelector('[data-studio-radius-label]');
    if (radiusLabel) radiusLabel.textContent = customRadius;
    var radiusSlider = document.querySelector('[data-studio-radius-slider]');
    if (radiusSlider) radiusSlider.value = parseFloat(customRadius);
  } else {
    var radiusSlider = document.querySelector('[data-studio-radius-slider]');
    if (radiusSlider) {
      var preset = stylePresets.find(function(p) { return p.name === activeStyle; }) || stylePresets[0];
      radiusSlider.value = parseFloat(preset.radius);
    }
  }

  // Preload all Google Fonts for preview text
  Object.keys(googleFonts).forEach(function(key) { loadGoogleFont(key); });

  // Apply custom font override
  if (customFont && fontOptions[customFont]) {
    loadGoogleFont(customFont);
    document.documentElement.style.setProperty('--font-sans', fontOptions[customFont]);
  }
  updateFontChecks();

  // Apply saved color tokens
  reapplyForMode();
  updateResetButton();
})();
`

// ─── Page Root ──────────────────────────────────────────────

export function StudioPage() {
  return (
    <div className="studio-canvas" style={{ margin: '-5rem -0.3rem 0', paddingTop: '3.5rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Viewport — scrollable, full width */}
      <div className="relative flex-1 overflow-auto" data-studio-viewport>
        {/* Floating Token Panel — top left */}
        <div className="fixed top-16 left-4 z-10 hidden lg:block">
          <TokenPanel />
        </div>

        {/* Zoom Controls — top right */}
        <div className="fixed top-16 right-4 z-10">
          <ZoomControls />
        </div>

        {/* Component Canvas — zoomable */}
        <div className="relative z-0" data-studio-canvas>
          <CanvasContent />
        </div>
      </div>

      {/* Detail panel — right side slide-in */}
      <DetailPanel />

      {/* Export bar — fixed at bottom */}
      <div className="sticky bottom-0 z-20">
        <ExportBar />
      </div>

      {/* Behavior scripts */}
      <script dangerouslySetInnerHTML={{ __html: zoomScript }} />
      <script dangerouslySetInnerHTML={{ __html: detailScript }} />
      <script dangerouslySetInnerHTML={{ __html: studioScript }} />
    </div>
  )
}
