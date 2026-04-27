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
import { FileUploadRefPage } from './pages/components/file-upload'
import { MusicPlayerRefPage } from './pages/components/music-player'
import { SpreadsheetRefPage } from './pages/components/spreadsheet'
import { PermissionMatrixRefPage } from './pages/components/permission-matrix'
import { FormBuilderRefPage } from './pages/components/form-builder'
import { PivotTableRefPage } from './pages/components/pivot-table'
import { DashboardBuilderRefPage } from './pages/components/dashboard-builder'
import { StateMachinePlaygroundRefPage } from './pages/components/state-machine-playground'
import { GraphEditorRefPage } from './pages/components/graph-editor'
import { ThemeCustomizerRefPage } from './pages/components/theme-customizer'
import { InfiniteScrollRefPage } from './pages/components/infinite-scroll'
import { ToastQueueRefPage } from './pages/components/toast-queue'
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
import { ProductivityMailPage } from './pages/gallery/productivity/mail'
import { ProductivityFilesPage } from './pages/gallery/productivity/files'
import { ProductivityBoardPage } from './pages/gallery/productivity/board'
import { ProductivityCalendarPage } from './pages/gallery/productivity/calendar'
import { SaasLandingPage } from './pages/gallery/saas/index'
import { SaasPricingPage } from './pages/gallery/saas/pricing'
import { SaasLoginPage } from './pages/gallery/saas/login'
import { SaasBlogPage } from './pages/gallery/saas/blog'
import { SaasBlogPostPage } from './pages/gallery/saas/blog-post'
import { SocialFeedPage } from './pages/gallery/social/index'
import { SocialProfilePage } from './pages/gallery/social/profile'
import { SocialThreadPage } from './pages/gallery/social/thread'
import { SocialMessagesPage } from './pages/gallery/social/messages'

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

  // Home - Hero + navigation links + showcase
  app.get('/', (c) => {
    return c.render(
      <div>
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

        {/* Practical UI examples */}
        <div className="mt-20 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Login Card */}
          <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm">
            <div className="grid gap-1 px-6">
              <h3 className="text-lg font-semibold leading-tight">Sign In</h3>
              <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
            </div>
            <div className="px-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Email</label>
                <input type="email" className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground" placeholder="you@example.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Password</label>
                <input type="password" className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground" placeholder="••••••••" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <span className="w-4 h-4 flex items-center justify-center text-xs rounded border bg-foreground text-background border-foreground">✓</span>
                <span>Remember me</span>
              </label>
              <button className="h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">Sign In</button>
            </div>
          </div>

          {/* Profile Card */}
          <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm">
            <div className="px-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center text-xl font-semibold text-primary-foreground bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-full">JD</div>
              <h3 className="text-lg font-semibold">Jane Doe</h3>
              <p className="text-sm text-muted-foreground mt-1">Software Engineer</p>
              <div className="flex justify-center gap-8 py-4 my-4 border-t border-b">
                <div className="text-center">
                  <span className="block text-lg font-semibold">128</span>
                  <span className="text-xs text-muted-foreground">Posts</span>
                </div>
                <div className="text-center">
                  <span className="block text-lg font-semibold">2.4k</span>
                  <span className="text-xs text-muted-foreground">Followers</span>
                </div>
                <div className="text-center">
                  <span className="block text-lg font-semibold">847</span>
                  <span className="text-xs text-muted-foreground">Following</span>
                </div>
              </div>
              <button className="w-full h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background hover:bg-accent">View Profile</button>
            </div>
          </div>

          {/* Settings Card */}
          <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm">
            <div className="grid gap-1 px-6">
              <h3 className="text-lg font-semibold leading-tight">Notifications</h3>
              <p className="text-sm text-muted-foreground">Manage your preferences</p>
            </div>
            <div className="px-6 flex flex-col">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <div className="text-sm font-medium">Email alerts</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Receive email notifications</div>
                </div>
                <span
                  role="switch"
                  aria-checked="true"
                  className="relative inline-flex h-5 w-10 flex-shrink-0 rounded-full cursor-pointer"
                  style="background: var(--gradient-start)"
                >
                  <span
                    className="absolute top-[2px] right-[2px] h-4 w-4 rounded-full"
                    style="background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2)"
                  />
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <div className="text-sm font-medium">Push notifications</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Receive push alerts</div>
                </div>
                <span
                  role="switch"
                  aria-checked="false"
                  className="relative inline-flex h-5 w-10 flex-shrink-0 rounded-full cursor-pointer"
                  style="background: var(--muted)"
                >
                  <span
                    className="absolute top-[2px] left-[2px] h-4 w-4 rounded-full"
                    style="background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2)"
                  />
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">Weekly digest</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Summary of activity</div>
                </div>
                <span
                  role="switch"
                  aria-checked="true"
                  className="relative inline-flex h-5 w-10 flex-shrink-0 rounded-full cursor-pointer"
                  style="background: var(--gradient-start)"
                >
                  <span
                    className="absolute top-[2px] right-[2px] h-4 w-4 rounded-full"
                    style="background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2)"
                  />
                </span>
              </div>
            </div>
          </div>

          {/* Pricing Card */}
          <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border border-[var(--gradient-start)] py-6 shadow-sm ring-1 ring-[var(--gradient-start)]">
            <div className="grid gap-1 px-6">
              <span className="inline-flex w-fit items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Popular</span>
              <h3 className="text-lg font-semibold leading-tight mt-2">Pro Plan</h3>
              <div className="mt-1">
                <span className="text-3xl font-bold">$29</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
            </div>
            <div className="px-6 flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li>✓ Unlimited projects</li>
                <li>✓ Priority support</li>
                <li>✓ Advanced analytics</li>
                <li>✓ Custom integrations</li>
              </ul>
              <button className="h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">Get Started</button>
            </div>
          </div>

          {/* Chat Card */}
          <div className="bg-card text-card-foreground flex flex-col rounded-xl border shadow-sm md:col-span-2 lg:col-span-2">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold leading-tight">Messages</h3>
            </div>
            <div className="px-6 py-4 flex flex-col gap-4 min-h-48">
              {/* Received message */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-primary-foreground bg-primary rounded-full">AS</div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">Alex Smith</span>
                    <span className="text-xs text-muted-foreground">10:42 AM</span>
                  </div>
                  <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2 text-sm max-w-xs">
                    Hey! How's the project going?
                  </div>
                </div>
              </div>
              {/* Sent message */}
              <div className="flex items-start gap-3 flex-row-reverse">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-primary-foreground bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-full">JD</div>
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">10:44 AM</span>
                    <span className="text-sm font-medium">You</span>
                  </div>
                  <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-3 py-2 text-sm max-w-xs">
                    Going great! Just finished the UI components.
                  </div>
                </div>
              </div>
              {/* Received message */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-primary-foreground bg-primary rounded-full">AS</div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">Alex Smith</span>
                    <span className="text-xs text-muted-foreground">10:45 AM</span>
                  </div>
                  <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2 text-sm max-w-xs">
                    Awesome! 🎉
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t">
              <div className="flex gap-2">
                <input type="text" className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground" placeholder="Type a message..." />
                <button className="h-9 px-4 inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">Send</button>
              </div>
            </div>
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

  // Music Player block page
  app.get('/components/music-player', (c) => {
    return c.render(<MusicPlayerRefPage />)
  })

  // File Upload block page
  app.get('/components/file-upload', (c) => {
    return c.render(<FileUploadRefPage />)
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

  // State Machine Playground block page
  app.get('/components/state-machine-playground', (c) => {
    return c.render(<StateMachinePlaygroundRefPage />)
  })

  // Graph / DAG Editor block page (Phase 9 Block #135)
  app.get('/components/graph-editor', (c) => {
    return c.render(<GraphEditorRefPage />)
  })

  // Theme Customizer block page
  app.get('/components/theme-customizer', (c) => {
    return c.render(<ThemeCustomizerRefPage />)
  })

  // Async Infinite Scroll block page
  app.get('/components/infinite-scroll', (c) => {
    return c.render(<InfiniteScrollRefPage />)
  })

  // Toast Queue block page
  app.get('/components/toast-queue', (c) => {
    return c.render(<ToastQueueRefPage />)
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

  // Gallery — Productivity app (Phase 9)
  app.get('/gallery/productivity', (c) => {
    return c.render(<ProductivityMailPage />)
  })

  app.get('/gallery/productivity/mail', (c) => {
    return c.render(<ProductivityMailPage />)
  })

  app.get('/gallery/productivity/files', (c) => {
    return c.render(<ProductivityFilesPage />)
  })

  app.get('/gallery/productivity/board', (c) => {
    return c.render(<ProductivityBoardPage />)
  })

  app.get('/gallery/productivity/calendar', (c) => {
    return c.render(<ProductivityCalendarPage />)
  })

  // Gallery — SaaS Marketing app (Phase 9)
  app.get('/gallery/saas', (c) => {
    return c.render(<SaasLandingPage />)
  })

  app.get('/gallery/saas/pricing', (c) => {
    return c.render(<SaasPricingPage />)
  })

  app.get('/gallery/saas/login', (c) => {
    return c.render(<SaasLoginPage />)
  })

  app.get('/gallery/saas/blog', (c) => {
    return c.render(<SaasBlogPage />)
  })

  app.get('/gallery/saas/blog/:slug', (c) => {
    const slug = c.req.param('slug')
    return c.render(<SaasBlogPostPage slug={slug} />)
  })

  app.get('/gallery/social', (c) => {
    return c.render(<SocialFeedPage />)
  })

  app.get('/gallery/social/profile', (c) => {
    return c.render(<SocialProfilePage />)
  })

  app.get('/gallery/social/thread', (c) => {
    return c.render(<SocialThreadPage />)
  })

  app.get('/gallery/social/messages', (c) => {
    return c.render(<SocialMessagesPage />)
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
