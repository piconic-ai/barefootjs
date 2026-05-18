/**
 * BarefootJS Documentation Routes
 *
 * Shared route definitions for both Bun (development) and Cloudflare Workers (production).
 * This module contains only the page routes, not static file serving.
 */

import { Hono } from 'hono'
import { renderer } from './renderer'
import { createOgRoute } from './og-route'

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
import { ThemeCustomizerRefPage } from './pages/components/theme-customizer'
import { InfiniteScrollRefPage } from './pages/components/infinite-scroll'
import { ToastQueueRefPage } from './pages/components/toast-queue'
import { RecursiveCommentsRefPage } from './pages/components/recursive-comments'
import { HoverCardRefPage } from './pages/components/hover-card'
import { MenubarRefPage } from './pages/components/menubar'
import { NavigationMenuRefPage } from './pages/components/navigation-menu'
import { EmptyRefPage } from './pages/components/empty'
import { KbdRefPage } from './pages/components/kbd'
import { NativeSelectRefPage } from './pages/components/native-select'
import { SpinnerRefPage } from './pages/components/spinner'
import { TypographyRefPage } from './pages/components/typography'
import { XyflowIntroductionPage } from './pages/xyflow/introduction'
import { XyflowNodesPage } from './pages/xyflow/nodes'
import { XyflowEdgesPage } from './pages/xyflow/edges'
import { XyflowComponentsPage } from './pages/xyflow/components'
import { ComponentCatalogPage } from './pages/components/catalog'

// Chart pages
import { ChartsIntroductionPage } from './pages/charts/introduction'
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
import { FormsIntroductionPage } from './pages/forms/introduction'
import { ValidationPage } from './pages/forms/validation'
import { FieldArraysPage } from './pages/forms/field-arrays'
import { RafUnmountStressPage } from './pages/stress/raf-unmount'

import { HomeShowcase } from '@/components/home-showcase'

import { componentEntries, blockEntries } from './components/shared/component-registry'

// Lookup maps for component / block meta (title + description) by slug.
// Used to forward per-page meta to the renderer for <title> and OGP tags.
const componentMetaBySlug = new Map(componentEntries.map(e => [e.slug, e]))
const blockMetaBySlug = new Map(blockEntries.map(e => [e.slug, e]))

function componentMeta(slug: string): { title: string; description: string } {
  const entry = componentMetaBySlug.get(slug)
  if (!entry) throw new Error(`Missing component registry entry for slug "${slug}"`)
  return { title: entry.title, description: entry.description }
}

function blockMeta(slug: string): { title: string; description: string } {
  const entry = blockMetaBySlug.get(slug)
  if (!entry) throw new Error(`Missing block registry entry for slug "${slug}"`)
  return { title: entry.title, description: entry.description }
}

/**
 * Create the documentation app with all routes.
 * Static file serving should be added by the caller (Bun or Workers specific).
 */
export function createApp() {
  const app = new Hono()

  app.use(renderer)

  // OG image generator (GET /og?title=...)
  app.route('/og', createOgRoute())

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

        {/* Practical UI examples — composed from the actual @ui/components */}
        <HomeShowcase />
      </div>
    )
  })

  // Studio - design system builder (#516)
  app.get('/studio', (c) => {
    return c.render(<StudioPage />, { title: 'Studio', description: 'Design system builder for BarefootJS components.' })
  })

  // Component catalog - visual card grid (#517)
  app.get('/components', (c) => {
    return c.render(<ComponentCatalogPage />, { title: 'Components', description: 'Browse the BarefootJS component catalog.' })
  })

  // Aspect Ratio reference page
  app.get('/components/aspect-ratio', (c) => {
    return c.render(<AspectRatioRefPage />, componentMeta('aspect-ratio'))
  })

  // Alert reference page
  app.get('/components/alert', (c) => {
    return c.render(<AlertRefPage />, componentMeta('alert'))
  })

  // Alert Dialog reference page
  app.get('/components/alert-dialog', (c) => {
    return c.render(<AlertDialogRefPage />, componentMeta('alert-dialog'))
  })

  // Badge reference page
  app.get('/components/badge', (c) => {
    return c.render(<BadgeRefPage />, componentMeta('badge'))
  })

  // Button reference page (redesigned #515)
  app.get('/components/button', (c) => {
    return c.render(<ButtonRefPage />, componentMeta('button'))
  })

  // Button Group reference page
  app.get('/components/button-group', (c) => {
    return c.render(<ButtonGroupRefPage />, componentMeta('button-group'))
  })

  // Combobox reference page (redesigned #515)
  app.get('/components/combobox', (c) => {
    return c.render(<ComboboxRefPage />, componentMeta('combobox'))
  })

  // Field reference page
  app.get('/components/field', (c) => {
    return c.render(<FieldRefPage />, componentMeta('field'))
  })

  // Label reference page (redesigned #515)
  app.get('/components/label', (c) => {
    return c.render(<LabelRefPage />, componentMeta('label'))
  })

  // Select reference page (redesigned #515)
  app.get('/components/select', (c) => {
    return c.render(<SelectRefPage />, componentMeta('select'))
  })

  // Textarea reference page (redesigned #515)
  app.get('/components/textarea', (c) => {
    return c.render(<TextareaRefPage />, componentMeta('textarea'))
  })

  // Toggle reference page (redesigned #515)
  app.get('/components/toggle', (c) => {
    return c.render(<ToggleRefPage />, componentMeta('toggle'))
  })

  // Avatar reference page (redesigned #515)
  app.get('/components/avatar', (c) => {
    return c.render(<AvatarRefPage />, componentMeta('avatar'))
  })

  // Calendar reference page (redesigned #515)
  app.get('/components/calendar', (c) => {
    return c.render(<CalendarRefPage />, componentMeta('calendar'))
  })

  // Card reference page (redesigned #515)
  app.get('/components/card', (c) => {
    return c.render(<CardRefPage />, componentMeta('card'))
  })

  // Carousel reference page (redesigned #515)
  app.get('/components/carousel', (c) => {
    return c.render(<CarouselRefPage />, componentMeta('carousel'))
  })

  // Data Table reference page (redesigned #515)
  app.get('/components/data-table', (c) => {
    return c.render(<DataTableRefPage />, componentMeta('data-table'))
  })

  // Skeleton reference page (redesigned #515)
  app.get('/components/skeleton', (c) => {
    return c.render(<SkeletonRefPage />, componentMeta('skeleton'))
  })

  // Table reference page (redesigned #515)
  app.get('/components/table', (c) => {
    return c.render(<TableRefPage />, componentMeta('table'))
  })

  // Breadcrumb reference page
  app.get('/components/breadcrumb', (c) => {
    return c.render(<BreadcrumbRefPage />, componentMeta('breadcrumb'))
  })

  // Collapsible reference page
  app.get('/components/collapsible', (c) => {
    return c.render(<CollapsibleRefPage />, componentMeta('collapsible'))
  })

  // Command reference page
  app.get('/components/command', (c) => {
    return c.render(<CommandRefPage />, componentMeta('command'))
  })

  // Checkbox reference page
  app.get('/components/checkbox', (c) => {
    return c.render(<CheckboxRefPage />, componentMeta('checkbox'))
  })

  // Input reference page (redesigned #515)
  app.get('/components/input', (c) => {
    return c.render(<InputRefPage />, componentMeta('input'))
  })

  // Input Group reference page
  app.get('/components/input-group', (c) => {
    return c.render(<InputGroupRefPage />, componentMeta('input-group'))
  })

  // Empty reference page
  app.get('/components/empty', (c) => {
    return c.render(<EmptyRefPage />, componentMeta('empty'))
  })

  // Kbd reference page
  app.get('/components/kbd', (c) => {
    return c.render(<KbdRefPage />, componentMeta('kbd'))
  })

  // Native Select reference page
  app.get('/components/native-select', (c) => {
    return c.render(<NativeSelectRefPage />, componentMeta('native-select'))
  })

  // Item reference page
  app.get('/components/item', (c) => {
    return c.render(<ItemRefPage />, componentMeta('item'))
  })

  // Spinner reference page
  app.get('/components/spinner', (c) => {
    return c.render(<SpinnerRefPage />, componentMeta('spinner'))
  })

  // Typography reference page
  app.get('/components/typography', (c) => {
    return c.render(<TypographyRefPage />, componentMeta('typography'))
  })

  // xyflow — Introduction, Nodes, Edges, Components. The previous
  // /components/xyflow reference page is retired; its API tables now
  // live at /xyflow/components.
  app.get('/xyflow/introduction', (c) => {
    return c.render(<XyflowIntroductionPage />)
  })
  app.get('/xyflow/nodes', (c) => {
    return c.render(<XyflowNodesPage />)
  })
  app.get('/xyflow/edges', (c) => {
    return c.render(<XyflowEdgesPage />)
  })
  app.get('/xyflow/components', (c) => {
    return c.render(<XyflowComponentsPage />)
  })

  // Switch reference page
  app.get('/components/switch', (c) => {
    return c.render(<SwitchRefPage />, componentMeta('switch'))
  })

  // Accordion reference page
  app.get('/components/accordion', (c) => {
    return c.render(<AccordionRefPage />, componentMeta('accordion'))
  })

  // Tabs reference page (migrated from /docs/components/tabs)
  app.get('/components/tabs', (c) => {
    return c.render(<TabsRefPage />, componentMeta('tabs'))
  })

  // Date Picker reference page
  app.get('/components/date-picker', (c) => {
    return c.render(<DatePickerRefPage />, componentMeta('date-picker'))
  })

  // Dialog reference page
  app.get('/components/dialog', (c) => {
    return c.render(<DialogRefPage />, componentMeta('dialog'))
  })

  // Context Menu reference page
  app.get('/components/context-menu', (c) => {
    return c.render(<ContextMenuRefPage />, componentMeta('context-menu'))
  })

// Dropdown Menu reference page
  app.get('/components/dropdown-menu', (c) => {
    return c.render(<DropdownMenuRefPage />, componentMeta('dropdown-menu'))
  })

  // Toast reference page
  app.get('/components/toast', (c) => {
    return c.render(<ToastRefPage />, componentMeta('toast'))
  })

  // Radio Group reference page (redesigned #515)
  app.get('/components/radio-group', (c) => {
    return c.render(<RadioGroupRefPage />, componentMeta('radio-group'))
  })

  // Input OTP reference page (redesigned #515)
  app.get('/components/input-otp', (c) => {
    return c.render(<InputOTPRefPage />, componentMeta('input-otp'))
  })

  // Slider reference page (redesigned #515)
  app.get('/components/slider', (c) => {
    return c.render(<SliderRefPage />, componentMeta('slider'))
  })

  // Toggle Group reference page (redesigned #515)
  app.get('/components/toggle-group', (c) => {
    return c.render(<ToggleGroupRefPage />, componentMeta('toggle-group'))
  })

  // Tooltip reference page
  app.get('/components/tooltip', (c) => {
    return c.render(<TooltipRefPage />, componentMeta('tooltip'))
  })


  // Separator reference page
  app.get('/components/separator', (c) => {
    return c.render(<SeparatorRefPage />, componentMeta('separator'))
  })


  // Portal reference page
  app.get('/components/portal', (c) => {
    return c.render(<PortalRefPage />, componentMeta('portal'))
  })

  // Menubar reference page
  app.get('/components/menubar', (c) => {
    return c.render(<MenubarRefPage />, componentMeta('menubar'))
  })

  // Navigation Menu reference page
  app.get('/components/navigation-menu', (c) => {
    return c.render(<NavigationMenuRefPage />, componentMeta('navigation-menu'))
  })

  // Pagination reference page
  app.get('/components/pagination', (c) => {
    return c.render(<PaginationRefPage />, componentMeta('pagination'))
  })

  // Popover reference page
  app.get('/components/popover', (c) => {
    return c.render(<PopoverRefPage />, componentMeta('popover'))
  })

  // Progress reference page
  app.get('/components/progress', (c) => {
    return c.render(<ProgressRefPage />, componentMeta('progress'))
  })


  // Hover Card reference page
  app.get('/components/hover-card', (c) => {
    return c.render(<HoverCardRefPage />, componentMeta('hover-card'))
  })

  // Resizable reference page
  app.get('/components/resizable', (c) => {
    return c.render(<ResizableRefPage />, componentMeta('resizable'))
  })

  // Scroll Area reference page (redesigned #515)
  app.get('/components/scroll-area', (c) => {
    return c.render(<ScrollAreaRefPage />, componentMeta('scroll-area'))
  })

  // Direction reference page
  app.get('/components/direction', (c) => {
    return c.render(<DirectionRefPage />, componentMeta('direction'))
  })

  // Drawer reference page (migrated from /docs/components/drawer)
  app.get('/components/drawer', (c) => {
    return c.render(<DrawerRefPage />, componentMeta('drawer'))
  })

  // Sheet reference page (redesigned)
  app.get('/components/sheet', (c) => {
    return c.render(<SheetRefPage />, componentMeta('sheet'))
  })

  // Music Player block page
  app.get('/components/music-player', (c) => {
    return c.render(<MusicPlayerRefPage />, blockMeta('music-player'))
  })

  // File Upload block page
  app.get('/components/file-upload', (c) => {
    return c.render(<FileUploadRefPage />, blockMeta('file-upload'))
  })

  // Spreadsheet block page
  app.get('/components/spreadsheet', (c) => {
    return c.render(<SpreadsheetRefPage />, blockMeta('spreadsheet'))
  })

  // Permission Matrix block page
  app.get('/components/permission-matrix', (c) => {
    return c.render(<PermissionMatrixRefPage />, blockMeta('permission-matrix'))
  })

  // Form Builder block page
  app.get('/components/form-builder', (c) => {
    return c.render(<FormBuilderRefPage />, blockMeta('form-builder'))
  })

  // Pivot Table block page
  app.get('/components/pivot-table', (c) => {
    return c.render(<PivotTableRefPage />, blockMeta('pivot-table'))
  })

  // Dashboard Builder block page
  app.get('/components/dashboard-builder', (c) => {
    return c.render(<DashboardBuilderRefPage />, blockMeta('dashboard-builder'))
  })

  // State Machine Playground block page
  app.get('/components/state-machine-playground', (c) => {
    return c.render(<StateMachinePlaygroundRefPage />, blockMeta('state-machine-playground'))
  })

  // Theme Customizer block page
  app.get('/components/theme-customizer', (c) => {
    return c.render(<ThemeCustomizerRefPage />, blockMeta('theme-customizer'))
  })

  // Async Infinite Scroll block page
  app.get('/components/infinite-scroll', (c) => {
    return c.render(<InfiniteScrollRefPage />, blockMeta('infinite-scroll'))
  })

  // Toast Queue block page
  app.get('/components/toast-queue', (c) => {
    return c.render(<ToastQueueRefPage />, blockMeta('toast-queue'))
  })

  // Recursive Comments block page
  app.get('/components/recursive-comments', (c) => {
    return c.render(<RecursiveCommentsRefPage />, blockMeta('recursive-comments'))
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

  // Charts — introduction (gallery + install)
  app.get('/charts/introduction', (c) => {
    return c.render(<ChartsIntroductionPage />)
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

  // Forms — introduction (createSignal pattern + @barefootjs/form overview)
  app.get('/docs/forms/introduction', (c) => {
    return c.render(<FormsIntroductionPage />)
  })

  // Form Validation pattern documentation
  app.get('/docs/forms/validation', (c) => {
    return c.render(<ValidationPage />)
  })

  // Field Arrays pattern documentation
  app.get('/docs/forms/field-arrays', (c) => {
    return c.render(<FieldArraysPage />)
  })

  // Compiler stress catalog (#1244) regression demos. Pages here back
  // the Layer 6 specs in `site/ui/e2e/stress-1244.spec.ts`.
  app.get('/stress/1244/raf-unmount', (c) => {
    return c.render(<RafUnmountStressPage />, { title: 'Stress #1366 — rAF unmount' })
  })

  return app
}
