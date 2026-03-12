/**
 * BarefootJS Documentation Routes
 *
 * Shared route definitions for both Bun (development) and Cloudflare Workers (production).
 * This module contains only the page routes, not static file serving.
 */

import { Hono } from 'hono'
import { renderer } from './renderer'

// Component pages
import { AspectRatioRefPage } from './pages/components/aspect-ratio'
import { AlertPage } from './pages/alert'
import { AlertDialogPage } from './pages/alert-dialog'
import { BadgeRefPage } from './pages/components/badge'
import { ButtonRefPage } from './pages/components/button'
import { ComboboxRefPage } from './pages/components/combobox'
import { InputRefPage } from './pages/components/input'
import { LabelRefPage } from './pages/components/label'
import { SelectRefPage } from './pages/components/select'
import { TextareaRefPage } from './pages/components/textarea'
import { SwitchRefPage } from './pages/components/switch'
import { ToggleRefPage } from './pages/components/toggle'
import { AvatarRefPage } from './pages/components/avatar'
import { CalendarRefPage } from './pages/components/calendar'
import { CardRefPage } from './pages/components/card'
import { CarouselRefPage } from './pages/components/carousel'
import { DataTableRefPage } from './pages/components/data-table'
import { SkeletonRefPage } from './pages/components/skeleton'
import { TableRefPage } from './pages/components/table'
import { RadioGroupRefPage } from './pages/components/radio-group'
import { InputOTPRefPage } from './pages/components/input-otp'
import { SliderRefPage } from './pages/components/slider'
import { ToggleGroupRefPage } from './pages/components/toggle-group'
import { BreadcrumbPage } from './pages/breadcrumb'
import { CalendarPage } from './pages/calendar'
import { CheckboxRefPage } from './pages/components/checkbox'
import { SliderPage } from './pages/slider'
import { SwitchPage } from './pages/switch'
import { AccordionPage } from './pages/accordion'
import { CollapsiblePage } from './pages/collapsible'
import { CommandPage } from './pages/command'
import { TabsPage } from './pages/tabs'
import { DialogPage } from './pages/dialog'
import { ContextMenuPage } from './pages/context-menu'
import { DatePickerPage } from './pages/date-picker'
import { DropdownMenuPage } from './pages/dropdown-menu'
import { ToastPage } from './pages/toast'
import { TogglePage } from './pages/toggle'
import { ToggleGroupPage } from './pages/toggle-group'
import { TooltipPage } from './pages/tooltip'
import { SelectPage } from './pages/select'
import { ResizableRefPage } from './pages/components/resizable'
import { ScrollAreaRefPage } from './pages/components/scroll-area'
import { SeparatorPage } from './pages/separator'
import { SeparatorRefPage } from './pages/components/separator'
import { SkeletonPage } from './pages/skeleton'
import { TextareaPage } from './pages/textarea'
import { PortalPage } from './pages/portal'
import { PaginationPage } from './pages/pagination'
import { PopoverPage } from './pages/popover'
import { ProgressPage } from './pages/progress'
import { DrawerPage } from './pages/drawer'
import { SheetPage } from './pages/sheet'
import { SidebarPage } from './pages/sidebar'
import { HoverCardPage } from './pages/hover-card'
import { MenubarPage } from './pages/menubar'
import { NavigationMenuPage } from './pages/navigation-menu'
import { TablePage } from './pages/table'
import { SpinnerPage } from './pages/spinner'
import { ComponentCatalogPage } from './pages/components/catalog'

// Chart pages
import { BarChartRefPage } from './pages/charts/bar-chart'

// Form pattern pages
import { ControlledInputPage } from './pages/forms/controlled-input'
import { ValidationPage } from './pages/forms/validation'
import { SubmitPage } from './pages/forms/submit'
import { FieldArraysPage } from './pages/forms/field-arrays'
import { CreateFormPage } from './pages/forms/create-form'


/**
 * Create the documentation app with all routes.
 * Static file serving should be added by the caller (Bun or Workers specific).
 */
export function createApp() {
  const app = new Hono()

  app.use(renderer)

  // Home - Hero + Components list
  app.get('/', (c) => {
    return c.render(
      <div className="space-y-12">
        {/* Hero */}
        <div className="space-y-4 max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            <span className="gradient-text">Ready-made</span> components for BarefootJS
          </h1>
          <p className="text-muted-foreground text-lg">
            Pick a component. Copy the code. Make it yours.
          </p>
        </div>

        {/* Components */}
        <div className="space-y-6" id="components">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Components</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <a href="/docs/components/accordion" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Accordion</h3>
              <p className="text-xs text-muted-foreground">Vertically collapsing content sections</p>
            </a>
            <a href="/docs/components/alert" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Alert</h3>
              <p className="text-xs text-muted-foreground">Callout for important content</p>
            </a>
            <a href="/docs/components/alert-dialog" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Alert Dialog</h3>
              <p className="text-xs text-muted-foreground">Modal dialog for important confirmations</p>
            </a>
            <a href="/components/aspect-ratio" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Aspect Ratio</h3>
              <p className="text-xs text-muted-foreground">Content within a desired ratio</p>
            </a>
            <a href="/components/avatar" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Avatar</h3>
              <p className="text-xs text-muted-foreground">User profile image with fallback</p>
            </a>
            <a href="/components/badge" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Badge</h3>
              <p className="text-xs text-muted-foreground">Small status indicator labels</p>
            </a>
            <a href="/docs/components/breadcrumb" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Breadcrumb</h3>
              <p className="text-xs text-muted-foreground">Navigation hierarchy trail</p>
            </a>
            <a href="/components/button" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Button</h3>
              <p className="text-xs text-muted-foreground">Clickable actions with multiple variants</p>
            </a>
            <a href="/components/calendar" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Calendar</h3>
              <p className="text-xs text-muted-foreground">Date picker with month navigation</p>
            </a>
            <a href="/components/card" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Card</h3>
              <p className="text-xs text-muted-foreground">Container for grouped content</p>
            </a>
            <a href="/components/carousel" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Carousel</h3>
              <p className="text-xs text-muted-foreground">Motion and swipe content slider</p>
            </a>
            <a href="/components/checkbox" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Checkbox</h3>
              <p className="text-xs text-muted-foreground">Toggle selection control</p>
            </a>
            <a href="/docs/components/collapsible" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Collapsible</h3>
              <p className="text-xs text-muted-foreground">Expandable content section</p>
            </a>
            <a href="/docs/components/command" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Command</h3>
              <p className="text-xs text-muted-foreground">Search and command menu</p>
            </a>
            <a href="/components/combobox" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Combobox</h3>
              <p className="text-xs text-muted-foreground">Autocomplete input with searchable dropdown</p>
            </a>
            <a href="/docs/components/context-menu" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Context Menu</h3>
              <p className="text-xs text-muted-foreground">Right-click menu at cursor position</p>
            </a>
            <a href="/components/data-table" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Data Table</h3>
              <p className="text-xs text-muted-foreground">Sortable, filterable data table</p>
            </a>
            <a href="/docs/components/date-picker" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Date Picker</h3>
              <p className="text-xs text-muted-foreground">Date selection with calendar popup</p>
            </a>
            <a href="/docs/components/dialog" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Dialog</h3>
              <p className="text-xs text-muted-foreground">Modal overlay with custom content</p>
            </a>
            <a href="/docs/components/drawer" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Drawer</h3>
              <p className="text-xs text-muted-foreground">Slide-out panel from screen edge</p>
            </a>
            <a href="/docs/components/dropdown-menu" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Dropdown Menu</h3>
              <p className="text-xs text-muted-foreground">Action menu triggered by a button</p>
            </a>
            <a href="/docs/components/hover-card" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Hover Card</h3>
              <p className="text-xs text-muted-foreground">Preview card on hover</p>
            </a>
            <a href="/components/input" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Input</h3>
              <p className="text-xs text-muted-foreground">Text input field</p>
            </a>
            <a href="/components/input-otp" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Input OTP</h3>
              <p className="text-xs text-muted-foreground">One-time password input</p>
            </a>
            <a href="/components/label" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Label</h3>
              <p className="text-xs text-muted-foreground">Accessible label for form controls</p>
            </a>
            <a href="/docs/components/menubar" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Menubar</h3>
              <p className="text-xs text-muted-foreground">Desktop application menu bar</p>
            </a>
            <a href="/docs/components/navigation-menu" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Navigation Menu</h3>
              <p className="text-xs text-muted-foreground">Hover-activated navigation links</p>
            </a>
            <a href="/docs/components/pagination" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Pagination</h3>
              <p className="text-xs text-muted-foreground">Page navigation controls</p>
            </a>
            <a href="/docs/components/popover" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Popover</h3>
              <p className="text-xs text-muted-foreground">Floating content anchored to a trigger</p>
            </a>
            <a href="/docs/components/progress" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Progress</h3>
              <p className="text-xs text-muted-foreground">Task completion indicator bar</p>
            </a>
            <a href="/components/radio-group" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Radio Group</h3>
              <p className="text-xs text-muted-foreground">Single-select option group</p>
            </a>
            <a href="/components/resizable" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Resizable</h3>
              <p className="text-xs text-muted-foreground">Draggable resize panels</p>
            </a>
            <a href="/components/scroll-area" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Scroll Area</h3>
              <p className="text-xs text-muted-foreground">Custom scrollbar container</p>
            </a>
            <a href="/docs/components/select" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Select</h3>
              <p className="text-xs text-muted-foreground">Dropdown selection control</p>
            </a>
            <a href="/docs/components/sidebar" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Sidebar</h3>
              <p className="text-xs text-muted-foreground">Collapsible navigation panel</p>
            </a>
            <a href="/docs/components/separator" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Separator</h3>
              <p className="text-xs text-muted-foreground">Visual divider between content</p>
            </a>
            <a href="/components/skeleton" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Skeleton</h3>
              <p className="text-xs text-muted-foreground">Placeholder loading indicator</p>
            </a>
            <a href="/docs/components/sheet" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Sheet</h3>
              <p className="text-xs text-muted-foreground">Side panel overlay</p>
            </a>
            <a href="/docs/components/slider" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Slider</h3>
              <p className="text-xs text-muted-foreground">Range value selector</p>
            </a>
            <a href="/docs/components/spinner" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Spinner</h3>
              <p className="text-xs text-muted-foreground">Animated loading indicator</p>
            </a>
            <a href="/docs/components/switch" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Switch</h3>
              <p className="text-xs text-muted-foreground">On/off toggle control</p>
            </a>
            <a href="/components/table" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Table</h3>
              <p className="text-xs text-muted-foreground">Responsive data table</p>
            </a>
            <a href="/docs/components/tabs" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Tabs</h3>
              <p className="text-xs text-muted-foreground">Tabbed content navigation</p>
            </a>
            <a href="/docs/components/textarea" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Textarea</h3>
              <p className="text-xs text-muted-foreground">Multi-line text input</p>
            </a>
            <a href="/docs/components/toast" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Toast</h3>
              <p className="text-xs text-muted-foreground">Temporary notification message</p>
            </a>
            <a href="/docs/components/toggle" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Toggle</h3>
              <p className="text-xs text-muted-foreground">Two-state pressed button</p>
            </a>
            <a href="/docs/components/toggle-group" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Toggle Group</h3>
              <p className="text-xs text-muted-foreground">Group of toggle buttons</p>
            </a>
            <a href="/docs/components/tooltip" className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2">
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">Tooltip</h3>
              <p className="text-xs text-muted-foreground">Informational text on hover</p>
            </a>
          </div>
        </div>

        {/* Form Patterns */}
        <div className="space-y-6" id="form-patterns">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Form Patterns</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href="/docs/forms/controlled-input"
              className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2"
            >
              <h2 className="text-sm font-medium text-foreground group-hover:text-foreground">Controlled Input</h2>
              <p className="text-xs text-muted-foreground">Signal ↔ input value synchronization</p>
            </a>

            <a
              href="/docs/forms/validation"
              className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2"
            >
              <h2 className="text-sm font-medium text-foreground group-hover:text-foreground">Form Validation</h2>
              <p className="text-xs text-muted-foreground">Client-side validation and error state management</p>
            </a>

            <a
              href="/docs/forms/submit"
              className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2"
            >
              <h2 className="text-sm font-medium text-foreground group-hover:text-foreground">Form Submit</h2>
              <p className="text-xs text-muted-foreground">Async submit handling with loading and error states</p>
            </a>

            <a
              href="/docs/forms/field-arrays"
              className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2"
            >
              <h2 className="text-sm font-medium text-foreground group-hover:text-foreground">Field Arrays</h2>
              <p className="text-xs text-muted-foreground">Dynamic list of form inputs with add/remove</p>
            </a>

            <a
              href="/docs/forms/create-form"
              className="group flex flex-col rounded-xl border border-border hover:border-ring transition-colors no-underline p-6 space-y-2"
            >
              <h2 className="text-sm font-medium text-foreground group-hover:text-foreground">createForm</h2>
              <p className="text-xs text-muted-foreground">Schema-driven form with createForm + Standard Schema</p>
            </a>
          </div>
        </div>
      </div>
    )
  })

  // Component catalog - visual card grid (#517)
  app.get('/components', (c) => {
    return c.render(<ComponentCatalogPage />)
  })

  // Aspect Ratio reference page
  app.get('/components/aspect-ratio', (c) => {
    return c.render(<AspectRatioRefPage />)
  })

  // Alert documentation
  app.get('/docs/components/alert', (c) => {
    return c.render(<AlertPage />)
  })

  // Alert Dialog documentation
  app.get('/docs/components/alert-dialog', (c) => {
    return c.render(<AlertDialogPage />)
  })

  // Badge reference page
  app.get('/components/badge', (c) => {
    return c.render(<BadgeRefPage />)
  })

  // Button reference page (redesigned #515)
  app.get('/components/button', (c) => {
    return c.render(<ButtonRefPage />)
  })

  // Combobox reference page (redesigned #515)
  app.get('/components/combobox', (c) => {
    return c.render(<ComboboxRefPage />)
  })

  // Label reference page (redesigned #515)
  app.get('/components/label', (c) => {
    return c.render(<LabelRefPage />)
  })

  // Select reference page (redesigned #515)
  app.get('/components/select', (c) => {
    return c.render(<SelectRefPage />)
  })

  // Textarea reference page (redesigned #515)
  app.get('/components/textarea', (c) => {
    return c.render(<TextareaRefPage />)
  })

  // Toggle reference page (redesigned #515)
  app.get('/components/toggle', (c) => {
    return c.render(<ToggleRefPage />)
  })

  // Avatar reference page (redesigned #515)
  app.get('/components/avatar', (c) => {
    return c.render(<AvatarRefPage />)
  })

  // Calendar reference page (redesigned #515)
  app.get('/components/calendar', (c) => {
    return c.render(<CalendarRefPage />)
  })

  // Card reference page (redesigned #515)
  app.get('/components/card', (c) => {
    return c.render(<CardRefPage />)
  })

  // Carousel reference page (redesigned #515)
  app.get('/components/carousel', (c) => {
    return c.render(<CarouselRefPage />)
  })

  // Data Table reference page (redesigned #515)
  app.get('/components/data-table', (c) => {
    return c.render(<DataTableRefPage />)
  })

  // Skeleton reference page (redesigned #515)
  app.get('/components/skeleton', (c) => {
    return c.render(<SkeletonRefPage />)
  })

  // Table reference page (redesigned #515)
  app.get('/components/table', (c) => {
    return c.render(<TableRefPage />)
  })

  // Breadcrumb documentation
  app.get('/docs/components/breadcrumb', (c) => {
    return c.render(<BreadcrumbPage />)
  })

  // Collapsible documentation
  app.get('/docs/components/collapsible', (c) => {
    return c.render(<CollapsiblePage />)
  })

  // Command documentation
  app.get('/docs/components/command', (c) => {
    return c.render(<CommandPage />)
  })

  // Checkbox reference page
  app.get('/components/checkbox', (c) => {
    return c.render(<CheckboxRefPage />)
  })

  // Input reference page (redesigned #515)
  app.get('/components/input', (c) => {
    return c.render(<InputRefPage />)
  })

  // Slider documentation
  app.get('/docs/components/slider', (c) => {
    return c.render(<SliderPage />)
  })

  // Spinner documentation
  app.get('/docs/components/spinner', (c) => {
    return c.render(<SpinnerPage />)
  })

  // Switch documentation
  app.get('/docs/components/switch', (c) => {
    return c.render(<SwitchPage />)
  })

  // Switch reference page (redesigned #515)
  app.get('/components/switch', (c) => {
    return c.render(<SwitchRefPage />)
  })

  // Accordion documentation
  app.get('/docs/components/accordion', (c) => {
    return c.render(<AccordionPage />)
  })

  // Tabs documentation
  app.get('/docs/components/tabs', (c) => {
    return c.render(<TabsPage />)
  })

  // Date Picker documentation
  app.get('/docs/components/date-picker', (c) => {
    return c.render(<DatePickerPage />)
  })

  // Dialog documentation
  app.get('/docs/components/dialog', (c) => {
    return c.render(<DialogPage />)
  })

  // Context Menu documentation
  app.get('/docs/components/context-menu', (c) => {
    return c.render(<ContextMenuPage />)
  })

// Dropdown Menu documentation
  app.get('/docs/components/dropdown-menu', (c) => {
    return c.render(<DropdownMenuPage />)
  })

  // Toast documentation
  app.get('/docs/components/toast', (c) => {
    return c.render(<ToastPage />)
  })

  // Toggle documentation
  app.get('/docs/components/toggle', (c) => {
    return c.render(<TogglePage />)
  })

  // Toggle Group documentation
  app.get('/docs/components/toggle-group', (c) => {
    return c.render(<ToggleGroupPage />)
  })

  // Radio Group reference page (redesigned #515)
  app.get('/components/radio-group', (c) => {
    return c.render(<RadioGroupRefPage />)
  })

  // Input OTP reference page (redesigned #515)
  app.get('/components/input-otp', (c) => {
    return c.render(<InputOTPRefPage />)
  })

  // Slider reference page (redesigned #515)
  app.get('/components/slider', (c) => {
    return c.render(<SliderRefPage />)
  })

  // Toggle Group reference page (redesigned #515)
  app.get('/components/toggle-group', (c) => {
    return c.render(<ToggleGroupRefPage />)
  })

  // Tooltip documentation
  app.get('/docs/components/tooltip', (c) => {
    return c.render(<TooltipPage />)
  })

  // Select documentation
  app.get('/docs/components/select', (c) => {
    return c.render(<SelectPage />)
  })

  // Separator documentation
  app.get('/docs/components/separator', (c) => {
    return c.render(<SeparatorPage />)
  })

  // Separator reference page (redesigned #515)
  app.get('/components/separator', (c) => {
    return c.render(<SeparatorRefPage />)
  })

  // Skeleton documentation
  app.get('/docs/components/skeleton', (c) => {
    return c.render(<SkeletonPage />)
  })

  // Textarea documentation
  app.get('/docs/components/textarea', (c) => {
    return c.render(<TextareaPage />)
  })

  // Portal documentation
  app.get('/docs/components/portal', (c) => {
    return c.render(<PortalPage />)
  })

  // Menubar documentation
  app.get('/docs/components/menubar', (c) => {
    return c.render(<MenubarPage />)
  })

  // Navigation Menu documentation
  app.get('/docs/components/navigation-menu', (c) => {
    return c.render(<NavigationMenuPage />)
  })

  // Pagination documentation
  app.get('/docs/components/pagination', (c) => {
    return c.render(<PaginationPage />)
  })

  // Popover documentation
  app.get('/docs/components/popover', (c) => {
    return c.render(<PopoverPage />)
  })

  // Progress documentation
  app.get('/docs/components/progress', (c) => {
    return c.render(<ProgressPage />)
  })


  // Hover Card documentation
  app.get('/docs/components/hover-card', (c) => {
    return c.render(<HoverCardPage />)
  })

  // Resizable reference page
  app.get('/components/resizable', (c) => {
    return c.render(<ResizableRefPage />)
  })

  // Scroll Area reference page (redesigned #515)
  app.get('/components/scroll-area', (c) => {
    return c.render(<ScrollAreaRefPage />)
  })

  // Drawer documentation
  app.get('/docs/components/drawer', (c) => {
    return c.render(<DrawerPage />)
  })

  // Sheet documentation
  app.get('/docs/components/sheet', (c) => {
    return c.render(<SheetPage />)
  })

  // Sidebar documentation
  app.get('/docs/components/sidebar', (c) => {
    return c.render(<SidebarPage />)
  })

  // Table documentation
  app.get('/docs/components/table', (c) => {
    return c.render(<TablePage />)
  })

  // Bar Chart reference page
  app.get('/charts/bar-chart', (c) => {
    return c.render(<BarChartRefPage />)
  })

  // Controlled Input pattern documentation
  app.get('/docs/forms/controlled-input', (c) => {
    return c.render(<ControlledInputPage />)
  })

  // Form Validation pattern documentation
  app.get('/docs/forms/validation', (c) => {
    return c.render(<ValidationPage />)
  })

  // Form Submit pattern documentation
  app.get('/docs/forms/submit', (c) => {
    return c.render(<SubmitPage />)
  })

  // Field Arrays pattern documentation
  app.get('/docs/forms/field-arrays', (c) => {
    return c.render(<FieldArraysPage />)
  })

  // createForm documentation
  app.get('/docs/forms/create-form', (c) => {
    return c.render(<CreateFormPage />)
  })

  return app
}
