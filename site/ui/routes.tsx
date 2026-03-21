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
import { AlertRefPage } from './pages/components/alert'
import { AlertDialogRefPage } from './pages/components/alert-dialog'
import { BadgeRefPage } from './pages/components/badge'
import { ButtonRefPage } from './pages/components/button'
import { ButtonGroupRefPage } from './pages/components/button-group'
import { ComboboxRefPage } from './pages/components/combobox'
import { InputRefPage } from './pages/components/input'
import { InputGroupRefPage } from './pages/components/input-group'
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
import { BreadcrumbRefPage } from './pages/components/breadcrumb'
import { CheckboxRefPage } from './pages/components/checkbox'
import { AccordionRefPage } from './pages/components/accordion'
import { CollapsibleRefPage } from './pages/components/collapsible'
import { CommandRefPage } from './pages/components/command'
import { TabsRefPage } from './pages/components/tabs'
import { DialogRefPage } from './pages/components/dialog'
import { ContextMenuRefPage } from './pages/components/context-menu'
import { DatePickerRefPage } from './pages/components/date-picker'
import { DropdownMenuRefPage } from './pages/components/dropdown-menu'
import { ToastRefPage } from './pages/components/toast'
import { TooltipRefPage } from './pages/components/tooltip'
import { ResizableRefPage } from './pages/components/resizable'
import { ScrollAreaRefPage } from './pages/components/scroll-area'
import { SeparatorRefPage } from './pages/components/separator'
import { PortalRefPage } from './pages/components/portal'
import { PaginationRefPage } from './pages/components/pagination'
import { PopoverRefPage } from './pages/components/popover'
import { ProgressRefPage } from './pages/components/progress'
import { DrawerRefPage } from './pages/components/drawer'
import { SheetRefPage } from './pages/components/sheet'
import { SidebarRefPage } from './pages/components/sidebar'
import { HoverCardRefPage } from './pages/components/hover-card'
import { MenubarRefPage } from './pages/components/menubar'
import { NavigationMenuRefPage } from './pages/components/navigation-menu'
import { SpinnerRefPage } from './pages/components/spinner'
import { ComponentCatalogPage } from './pages/components/catalog'

// Chart pages
import { BarChartRefPage } from './pages/charts/bar-chart'
import { RadialChartRefPage } from './pages/charts/radial-chart'
import { RadarChartRefPage } from './pages/charts/radar-chart'
import { PieChartRefPage } from './pages/charts/pie-chart'
import { AreaChartRefPage } from './pages/charts/area-chart'
import { LineChartRefPage } from './pages/charts/line-chart'

// Studio page
import { StudioPage } from './pages/studio'

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

  // Home - Hero + navigation links
  app.get('/', (c) => {
    return c.render(
      <div className="space-y-12">
        {/* Hero */}
        <div className="space-y-6 max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            <span className="gradient-text">Ready-made</span> components for BarefootJS
          </h1>
          <p className="text-muted-foreground text-lg">
            Pick a component. Copy the code. Make it yours.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="/components" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90 transition-colors">
              Browse All Components
            </a>
          </div>
        </div>
      </div>
    )
  })

  // Studio - design system builder (#516)
  app.get('/studio', (c) => {
    return c.render(<StudioPage />)
  })

  // Component catalog - visual card grid (#517)
  app.get('/components', (c) => {
    return c.render(<ComponentCatalogPage />)
  })

  // Aspect Ratio reference page
  app.get('/components/aspect-ratio', (c) => {
    return c.render(<AspectRatioRefPage />)
  })

  // Alert reference page
  app.get('/components/alert', (c) => {
    return c.render(<AlertRefPage />)
  })

  // Alert Dialog reference page
  app.get('/components/alert-dialog', (c) => {
    return c.render(<AlertDialogRefPage />)
  })

  // Badge reference page
  app.get('/components/badge', (c) => {
    return c.render(<BadgeRefPage />)
  })

  // Button reference page (redesigned #515)
  app.get('/components/button', (c) => {
    return c.render(<ButtonRefPage />)
  })

  // Button Group reference page
  app.get('/components/button-group', (c) => {
    return c.render(<ButtonGroupRefPage />)
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

  // Breadcrumb reference page
  app.get('/components/breadcrumb', (c) => {
    return c.render(<BreadcrumbRefPage />)
  })

  // Collapsible reference page
  app.get('/components/collapsible', (c) => {
    return c.render(<CollapsibleRefPage />)
  })

  // Command reference page
  app.get('/components/command', (c) => {
    return c.render(<CommandRefPage />)
  })

  // Checkbox reference page
  app.get('/components/checkbox', (c) => {
    return c.render(<CheckboxRefPage />)
  })

  // Input reference page (redesigned #515)
  app.get('/components/input', (c) => {
    return c.render(<InputRefPage />)
  })

  // Input Group reference page
  app.get('/components/input-group', (c) => {
    return c.render(<InputGroupRefPage />)
  })

  // Spinner reference page
  app.get('/components/spinner', (c) => {
    return c.render(<SpinnerRefPage />)
  })

  // Switch reference page
  app.get('/components/switch', (c) => {
    return c.render(<SwitchRefPage />)
  })

  // Accordion reference page
  app.get('/components/accordion', (c) => {
    return c.render(<AccordionRefPage />)
  })

  // Tabs reference page (migrated from /docs/components/tabs)
  app.get('/components/tabs', (c) => {
    return c.render(<TabsRefPage />)
  })

  // Date Picker reference page
  app.get('/components/date-picker', (c) => {
    return c.render(<DatePickerRefPage />)
  })

  // Dialog reference page
  app.get('/components/dialog', (c) => {
    return c.render(<DialogRefPage />)
  })

  // Context Menu reference page
  app.get('/components/context-menu', (c) => {
    return c.render(<ContextMenuRefPage />)
  })

// Dropdown Menu reference page
  app.get('/components/dropdown-menu', (c) => {
    return c.render(<DropdownMenuRefPage />)
  })

  // Toast reference page
  app.get('/components/toast', (c) => {
    return c.render(<ToastRefPage />)
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

  // Tooltip reference page
  app.get('/components/tooltip', (c) => {
    return c.render(<TooltipRefPage />)
  })


  // Separator reference page
  app.get('/components/separator', (c) => {
    return c.render(<SeparatorRefPage />)
  })


  // Portal reference page
  app.get('/components/portal', (c) => {
    return c.render(<PortalRefPage />)
  })

  // Menubar reference page
  app.get('/components/menubar', (c) => {
    return c.render(<MenubarRefPage />)
  })

  // Navigation Menu reference page
  app.get('/components/navigation-menu', (c) => {
    return c.render(<NavigationMenuRefPage />)
  })

  // Pagination reference page
  app.get('/components/pagination', (c) => {
    return c.render(<PaginationRefPage />)
  })

  // Popover reference page
  app.get('/components/popover', (c) => {
    return c.render(<PopoverRefPage />)
  })

  // Progress reference page
  app.get('/components/progress', (c) => {
    return c.render(<ProgressRefPage />)
  })


  // Hover Card reference page
  app.get('/components/hover-card', (c) => {
    return c.render(<HoverCardRefPage />)
  })

  // Resizable reference page
  app.get('/components/resizable', (c) => {
    return c.render(<ResizableRefPage />)
  })

  // Scroll Area reference page (redesigned #515)
  app.get('/components/scroll-area', (c) => {
    return c.render(<ScrollAreaRefPage />)
  })

  // Drawer reference page (migrated from /docs/components/drawer)
  app.get('/components/drawer', (c) => {
    return c.render(<DrawerRefPage />)
  })

  // Sheet reference page (redesigned)
  app.get('/components/sheet', (c) => {
    return c.render(<SheetRefPage />)
  })

  // Sidebar reference page (migrated from /docs/components/sidebar)
  app.get('/components/sidebar', (c) => {
    return c.render(<SidebarRefPage />)
  })


  // Bar Chart reference page
  app.get('/charts/bar-chart', (c) => {
    return c.render(<BarChartRefPage />)
  })

  // Radial Chart reference page
  app.get('/charts/radial-chart', (c) => {
    return c.render(<RadialChartRefPage />)
  })

  // Radar Chart reference page
  app.get('/charts/radar-chart', (c) => {
    return c.render(<RadarChartRefPage />)
  })

  // Pie Chart reference page
  app.get('/charts/pie-chart', (c) => {
    return c.render(<PieChartRefPage />)
  })

  // Area Chart reference page
  app.get('/charts/area-chart', (c) => {
    return c.render(<AreaChartRefPage />)
  })

  // Line Chart reference page
  app.get('/charts/line-chart', (c) => {
    return c.render(<LineChartRefPage />)
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
