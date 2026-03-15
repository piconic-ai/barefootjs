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
  'Combobox': { slug: 'combobox', patterns: [{ title: 'Combobox', render: () => <p className="text-xs italic text-muted-foreground">Autocomplete input with dropdown suggestions.</p> }] },
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
// Presets define the structural skeleton: radius, shadow depth, and font.
// Colors are a separate concern — users customize them independently.

interface StylePreset {
  name: string
  description: string
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
    description: 'Soft and rounded, with generous curves.',
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
    name: 'Flat',
    description: 'Minimal elevation. Borders over shadows.',
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
      {/* Inline OKLCH editor — hidden by default */}
      <div className="hidden pl-1 pr-0.5 pb-1.5 pt-1 space-y-1" data-studio-color-editor={name}>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-5 h-5 rounded border border-border shrink-0" style={{ backgroundColor: `var(--${name})` }} data-studio-color-editor-preview={name} />
          <span className="text-[10px] font-mono text-muted-foreground" data-studio-color-value={name} />
        </div>
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
        {/* Style Presets */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Style</span>
          <div className="space-y-1">
            {stylePresets.map((preset, i) => (
              <button
                className={`w-full text-left px-2 py-1.5 rounded-md border transition-colors ${
                  i === 0
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:border-ring'
                }`}
                data-studio-preset={preset.name}
              >
                <div className="text-[11px] font-medium">{preset.name}</div>
                <div className="text-[9px] opacity-70">{preset.description}</div>
              </button>
            ))}
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

        {/* Typography */}
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Font</span>
          <div className="text-[11px] font-mono text-muted-foreground">system-ui, sans-serif</div>
        </div>
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
      <div className="flex items-center justify-center min-h-8">
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
          <div className="flex gap-1">
            <Button size="sm">Primary</Button>
            <Button variant="outline" size="sm">Outline</Button>
            <Button variant="secondary" size="sm">Secondary</Button>
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
          <div className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Select...</span>
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </div>
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
          <div className="w-full rounded-md border border-input bg-background px-2 py-1 text-[11px] text-muted-foreground">
            Search...
          </div>
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
  var stylePresets = ${stylePresetsJson};
  var defaultColors = ${defaultColorsJson};
  var activeStyle = 'Default';
  var customTokens = {};

  function isDark() {
    return document.documentElement.classList.contains('dark');
  }

  function getMode() {
    return isDark() ? 'dark' : 'light';
  }

  // ── Parse oklch string into {l, c, h} ──
  function parseOklch(str) {
    var m = str.match(/oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)/);
    if (!m) return { l: 0.5, c: 0, h: 0 };
    return { l: parseFloat(m[1]), c: parseFloat(m[2]), h: parseFloat(m[3]) };
  }

  function buildOklch(l, c, h) {
    return 'oklch(' + l.toFixed(3) + ' ' + c.toFixed(3) + ' ' + h + ')';
  }

  // ── Get current color token value (custom > default) ──
  function getTokenValue(token, mode) {
    if (customTokens[token] && customTokens[token][mode]) {
      return customTokens[token][mode];
    }
    return defaultColors[token] ? defaultColors[token][mode] : 'oklch(0.5 0 0)';
  }

  // ── Update style preset button styles ──
  function updateStyleButtons() {
    var buttons = document.querySelectorAll('[data-studio-preset]');
    buttons.forEach(function(btn) {
      var name = btn.getAttribute('data-studio-preset');
      if (name === activeStyle) {
        btn.className = btn.className
          .replace('border-border text-muted-foreground hover:border-ring', '')
          .replace('border-ring bg-accent text-accent-foreground', '')
          .trim() + ' border-ring bg-accent text-accent-foreground';
      } else {
        btn.className = btn.className
          .replace('border-ring bg-accent text-accent-foreground', '')
          .replace('border-border text-muted-foreground hover:border-ring', '')
          .trim() + ' border-border text-muted-foreground hover:border-ring';
      }
    });
  }

  // ── Apply style preset (radius + shadow + font) ──
  function applyStyle(name) {
    var preset = stylePresets.find(function(p) { return p.name === name; });
    if (!preset) return;

    activeStyle = name;
    var root = document.documentElement;

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

    // Update radius label + slider
    var radiusLabel = document.querySelector('[data-studio-radius-label]');
    if (radiusLabel) radiusLabel.textContent = preset.radius;
    var radiusSlider = document.querySelector('[data-studio-radius-slider]');
    if (radiusSlider) radiusSlider.value = parseFloat(preset.radius);

    updateStyleButtons();
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

    var sliderL = document.querySelector('[data-studio-slider-l="' + token + '"]');
    var sliderC = document.querySelector('[data-studio-slider-c="' + token + '"]');
    var sliderH = document.querySelector('[data-studio-slider-h="' + token + '"]');
    var labelL = document.querySelector('[data-studio-label-l="' + token + '"]');
    var labelC = document.querySelector('[data-studio-label-c="' + token + '"]');
    var labelH = document.querySelector('[data-studio-label-h="' + token + '"]');
    var valueEl = document.querySelector('[data-studio-color-value="' + token + '"]');

    if (sliderL) sliderL.value = parsed.l;
    if (sliderC) sliderC.value = parsed.c;
    if (sliderH) sliderH.value = parsed.h;
    if (labelL) labelL.textContent = parsed.l.toFixed(3);
    if (labelC) labelC.textContent = parsed.c.toFixed(3);
    if (labelH) labelH.textContent = Math.round(parsed.h);
    if (valueEl) valueEl.textContent = val;
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
    } else if (slider.hasAttribute('data-studio-radius-slider')) {
      // Radius slider
      var val = parseFloat(slider.value);
      var radiusVal = val + 'rem';
      document.documentElement.style.setProperty('--radius', radiusVal);
      var radiusLabel = document.querySelector('[data-studio-radius-label]');
      if (radiusLabel) radiusLabel.textContent = radiusVal;
      return;
    } else {
      return;
    }

    var mode = getMode();
    var currentVal = getTokenValue(token, mode);
    var parsed = parseOklch(currentVal);

    // Update the changed component
    if (component === 'l') parsed.l = parseFloat(slider.value);
    if (component === 'c') parsed.c = parseFloat(slider.value);
    if (component === 'h') parsed.h = parseFloat(slider.value);

    var newVal = buildOklch(parsed.l, parsed.c, parsed.h);

    // Store in customTokens
    if (!customTokens[token]) {
      customTokens[token] = {};
      // Seed the other mode with the default value
      var otherMode = mode === 'light' ? 'dark' : 'light';
      customTokens[token][otherMode] = getTokenValue(token, otherMode);
    }
    customTokens[token][mode] = newVal;

    // Apply immediately
    document.documentElement.style.setProperty('--' + token, newVal);

    // Update labels
    var labelL = document.querySelector('[data-studio-label-l="' + token + '"]');
    var labelC = document.querySelector('[data-studio-label-c="' + token + '"]');
    var labelH = document.querySelector('[data-studio-label-h="' + token + '"]');
    var valueEl = document.querySelector('[data-studio-color-value="' + token + '"]');
    if (labelL) labelL.textContent = parsed.l.toFixed(3);
    if (labelC) labelC.textContent = parsed.c.toFixed(3);
    if (labelH) labelH.textContent = Math.round(parsed.h);
    if (valueEl) valueEl.textContent = newVal;
  });

  // ── Style preset button click ──
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-studio-preset]');
    if (!btn) return;
    // Ignore clicks on color edit buttons inside the panel
    if (e.target.closest('[data-studio-color-edit]')) return;
    var name = btn.getAttribute('data-studio-preset');
    applyStyle(name);
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

  // ── Initialize radius slider ──
  var radiusSlider = document.querySelector('[data-studio-radius-slider]');
  if (radiusSlider) {
    radiusSlider.value = parseFloat(stylePresets[0].radius);
  }
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
