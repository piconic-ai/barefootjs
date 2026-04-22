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
import { ItemRefPage } from './pages/components/item'
import { FieldRefPage } from './pages/components/field'
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
import { DirectionRefPage } from './pages/components/direction'
import { DrawerRefPage } from './pages/components/drawer'
import { SheetRefPage } from './pages/components/sheet'
import { DashboardRefPage } from './pages/components/dashboard'
import { AnalyticsDashboardRefPage } from './pages/components/analytics-dashboard'
import { UserProfileRefPage } from './pages/components/user-profile'
import { ProductCardsRefPage } from './pages/components/product-cards'
import { PricingRefPage } from './pages/components/pricing'
import { FileUploadRefPage } from './pages/components/file-upload'
import { MailRefPage } from './pages/components/mail'
import { KanbanRefPage } from './pages/components/kanban'
import { LoginRefPage } from './pages/components/login'
import { SettingsRefPage } from './pages/components/settings'
import { SidebarRefPage } from './pages/components/sidebar'
import { ChatRefPage } from './pages/components/chat'
import { MusicPlayerRefPage } from './pages/components/music-player'
import { MultiStepFormRefPage } from './pages/components/multi-step-form'
import { TasksTableRefPage } from './pages/components/tasks-table'
import { SocialFeedRefPage } from './pages/components/social-feed'
import { FileBrowserRefPage } from './pages/components/file-browser'
import { CartRefPage } from './pages/components/cart'
import { CheckoutRefPage } from './pages/components/checkout'
import { CommentsRefPage } from './pages/components/comments'
import { NotificationsCenterRefPage } from './pages/components/notifications-center'
import { InventoryManagerRefPage } from './pages/components/inventory-manager'
import { SpreadsheetRefPage } from './pages/components/spreadsheet'
import { PermissionMatrixRefPage } from './pages/components/permission-matrix'
import { FormBuilderRefPage } from './pages/components/form-builder'
import { PivotTableRefPage } from './pages/components/pivot-table'
import { DashboardBuilderRefPage } from './pages/components/dashboard-builder'
import { CalendarSchedulerRefPage } from './pages/components/calendar-scheduler'
import { StateMachinePlaygroundRefPage } from './pages/components/state-machine-playground'
import { HoverCardRefPage } from './pages/components/hover-card'
import { MenubarRefPage } from './pages/components/menubar'
import { NavigationMenuRefPage } from './pages/components/navigation-menu'
import { EmptyRefPage } from './pages/components/empty'
import { KbdRefPage } from './pages/components/kbd'
import { NativeSelectRefPage } from './pages/components/native-select'
import { SpinnerRefPage } from './pages/components/spinner'
import { TypographyRefPage } from './pages/components/typography'
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

// Gallery pages (Phase 9)
import { AdminOverviewPage } from './pages/gallery/admin/index'
import { AdminAnalyticsPage } from './pages/gallery/admin/analytics'
import { AdminOrdersPage } from './pages/gallery/admin/orders'
import { AdminNotificationsPage } from './pages/gallery/admin/notifications'
import { AdminSettingsPage } from './pages/gallery/admin/settings'
import { ShopCatalogPage } from './pages/gallery/shop/index'
import { ShopCartPage } from './pages/gallery/shop/cart'
import { ShopCheckoutPage } from './pages/gallery/shop/checkout'

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

  // Field reference page
  app.get('/components/field', (c) => {
    return c.render(<FieldRefPage />)
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

  // Empty reference page
  app.get('/components/empty', (c) => {
    return c.render(<EmptyRefPage />)
  })

  // Kbd reference page
  app.get('/components/kbd', (c) => {
    return c.render(<KbdRefPage />)
  })

  // Native Select reference page
  app.get('/components/native-select', (c) => {
    return c.render(<NativeSelectRefPage />)
  })

  // Item reference page
  app.get('/components/item', (c) => {
    return c.render(<ItemRefPage />)
  })

  // Spinner reference page
  app.get('/components/spinner', (c) => {
    return c.render(<SpinnerRefPage />)
  })

  // Typography reference page
  app.get('/components/typography', (c) => {
    return c.render(<TypographyRefPage />)
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

  // Direction reference page
  app.get('/components/direction', (c) => {
    return c.render(<DirectionRefPage />)
  })

  // Drawer reference page (migrated from /docs/components/drawer)
  app.get('/components/drawer', (c) => {
    return c.render(<DrawerRefPage />)
  })

  // Sheet reference page (redesigned)
  app.get('/components/sheet', (c) => {
    return c.render(<SheetRefPage />)
  })

  // Dashboard block page
  app.get('/components/dashboard', (c) => {
    return c.render(<DashboardRefPage />)
  })

  // Analytics Dashboard block page
  app.get('/components/analytics-dashboard', (c) => {
    return c.render(<AnalyticsDashboardRefPage />)
  })

  // User Profile block page
  app.get('/components/user-profile', (c) => {
    return c.render(<UserProfileRefPage />)
  })

  // Product Cards block page
  app.get('/components/product-cards', (c) => {
    return c.render(<ProductCardsRefPage />)
  })

  // Pricing block page
  app.get('/components/pricing', (c) => {
    return c.render(<PricingRefPage />)
  })

  // File Upload block page
  app.get('/components/file-upload', (c) => {
    return c.render(<FileUploadRefPage />)
  })

  // Mail block page
  app.get('/components/mail', (c) => {
    return c.render(<MailRefPage />)
  })

  // Kanban block page
  app.get('/components/kanban', (c) => {
    return c.render(<KanbanRefPage />)
  })

  // Login block page
  app.get('/components/login', (c) => {
    return c.render(<LoginRefPage />)
  })

  // Settings block page
  app.get('/components/settings', (c) => {
    return c.render(<SettingsRefPage />)
  })

  // Sidebar reference page (migrated from /docs/components/sidebar)
  app.get('/components/sidebar', (c) => {
    return c.render(<SidebarRefPage />)
  })

  // Chat block page
  app.get('/components/chat', (c) => {
    return c.render(<ChatRefPage />)
  })

  // Music Player block page
  app.get('/components/music-player', (c) => {
    return c.render(<MusicPlayerRefPage />)
  })

  // Multi-Step Form block page
  app.get('/components/multi-step-form', (c) => {
    return c.render(<MultiStepFormRefPage />)
  })

  // Tasks Table block page
  app.get('/components/tasks-table', (c) => {
    return c.render(<TasksTableRefPage />)
  })

  // Social Feed block page
  app.get('/components/social-feed', (c) => {
    return c.render(<SocialFeedRefPage />)
  })

  // File Browser block page
  app.get('/components/file-browser', (c) => {
    return c.render(<FileBrowserRefPage />)
  })

  // Cart block page
  app.get('/components/cart', (c) => {
    return c.render(<CartRefPage />)
  })

  // Checkout block page
  app.get('/components/checkout', (c) => {
    return c.render(<CheckoutRefPage />)
  })

  // Comments block page
  app.get('/components/comments', (c) => {
    return c.render(<CommentsRefPage />)
  })

  // Notifications Center block page
  app.get('/components/notifications-center', (c) => {
    return c.render(<NotificationsCenterRefPage />)
  })

  // Inventory Manager block page
  app.get('/components/inventory-manager', (c) => {
    return c.render(<InventoryManagerRefPage />)
  })

  // Spreadsheet block page
  app.get('/components/spreadsheet', (c) => {
    return c.render(<SpreadsheetRefPage />)
  })

  // Permission Matrix block page
  app.get('/components/permission-matrix', (c) => {
    return c.render(<PermissionMatrixRefPage />)
  })

  // Form Builder block page
  app.get('/components/form-builder', (c) => {
    return c.render(<FormBuilderRefPage />)
  })

  // Pivot Table block page
  app.get('/components/pivot-table', (c) => {
    return c.render(<PivotTableRefPage />)
  })

  // Dashboard Builder block page
  app.get('/components/dashboard-builder', (c) => {
    return c.render(<DashboardBuilderRefPage />)
  })

  // Calendar Scheduler block page
  app.get('/components/calendar-scheduler', (c) => {
    return c.render(<CalendarSchedulerRefPage />)
  })

  // State Machine Playground block page
  app.get('/components/state-machine-playground', (c) => {
    return c.render(<StateMachinePlaygroundRefPage />)
  })

  // Gallery — Admin app (Phase 9 pilot)
  app.get('/gallery/admin', (c) => {
    return c.render(<AdminOverviewPage />)
  })

  app.get('/gallery/admin/analytics', (c) => {
    return c.render(<AdminAnalyticsPage />)
  })

  app.get('/gallery/admin/orders', (c) => {
    return c.render(<AdminOrdersPage />)
  })

  app.get('/gallery/admin/notifications', (c) => {
    return c.render(<AdminNotificationsPage />)
  })

  app.get('/gallery/admin/settings', (c) => {
    return c.render(<AdminSettingsPage />)
  })

  // Gallery — Shop app (Phase 9)
  app.get('/gallery/shop', (c) => {
    return c.render(<ShopCatalogPage />)
  })

  app.get('/gallery/shop/cart', (c) => {
    return c.render(<ShopCartPage />)
  })

  app.get('/gallery/shop/checkout', (c) => {
    return c.render(<ShopCheckoutPage />)
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
