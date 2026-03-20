/**
 * Component Catalog Page
 *
 * Visual card grid catalog at /components with tag-based filtering.
 * Each card shows a live-rendered component preview with the component name.
 * Ref: #517
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { CatalogFilter } from '@/components/catalog-filter'
import { Accordion, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Calendar } from '@/components/ui/calendar'
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Combobox, ComboboxTrigger, ComboboxValue } from '@/components/ui/combobox'
import { Command, CommandInput } from '@/components/ui/command'
import { DataTableColumnHeader } from '@/components/ui/data-table'
import { DatePicker } from '@/components/ui/date-picker'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { Menubar, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar'
import { NavigationMenu, NavigationMenuList, NavigationMenuItem } from '@/components/ui/navigation-menu'
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip } from '@/components/ui/tooltip'

// Tag definitions for filtering
export type ComponentTag = 'input' | 'display' | 'feedback' | 'navigation' | 'layout'

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
    preview: () => (
      <div className="w-full max-w-[200px]">
        <Accordion>
          <AccordionItem value="1">
            <AccordionTrigger>Is it accessible?</AccordionTrigger>
          </AccordionItem>
          <AccordionItem value="2">
            <AccordionTrigger>Is it styled?</AccordionTrigger>
          </AccordionItem>
        </Accordion>
      </div>
    ),
  },
  {
    slug: 'alert',
    title: 'Alert',
    description: 'Callout for important content',
    tags: ['feedback'],
    preview: () => (
      <Alert className="max-w-[200px]">
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription className="text-xs">You can add components.</AlertDescription>
      </Alert>
    ),
  },
  {
    slug: 'alert-dialog',
    title: 'Alert Dialog',
    description: 'Modal dialog for important confirmations',
    tags: ['feedback'],
    preview: () => (
      <Button size="sm" variant="destructive">Delete Account</Button>
    ),
  },
  {
    slug: 'aspect-ratio',
    title: 'Aspect Ratio',
    description: 'Content within a desired ratio',
    tags: ['display'],
    preview: () => (
      <div className="w-full max-w-[160px]">
        <AspectRatio ratio={16 / 9}>
          <div className="flex items-center justify-center w-full h-full bg-muted rounded-md text-xs text-muted-foreground">16 : 9</div>
        </AspectRatio>
      </div>
    ),
  },
  {
    slug: 'avatar',
    title: 'Avatar',
    description: 'User profile image with fallback',
    tags: ['display'],
    preview: () => (
      <div className="flex items-center gap-2">
        <div style="box-shadow: 0 0 0 2px var(--ring); border-radius: 9999px;">
          <Avatar><AvatarFallback>CN</AvatarFallback></Avatar>
        </div>
        <div style="box-shadow: 0 0 0 2px var(--ring); border-radius: 9999px;">
          <Avatar><AvatarFallback>JD</AvatarFallback></Avatar>
        </div>
        <div style="box-shadow: 0 0 0 2px var(--ring); border-radius: 9999px;">
          <Avatar><AvatarFallback>AB</AvatarFallback></Avatar>
        </div>
      </div>
    ),
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
    preview: () => (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><span>Home</span></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Page</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ),
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
    preview: () => (
      <div className="w-[180px] h-[100px] overflow-hidden">
        <div style="transform: scale(0.55); transform-origin: top center;">
          <Calendar />
        </div>
      </div>
    ),
  },
  {
    slug: 'card',
    title: 'Card',
    description: 'Container for grouped content',
    tags: ['display'],
    preview: () => (
      <Card className="w-full max-w-[180px]">
        <CardHeader className="p-3">
          <CardTitle className="text-xs">Card Title</CardTitle>
          <CardDescription className="text-xs">Description</CardDescription>
        </CardHeader>
      </Card>
    ),
  },
  {
    slug: 'carousel',
    title: 'Carousel',
    description: 'Motion and swipe content slider',
    tags: ['display'],
    preview: () => (
      <div className="w-full max-w-[200px]">
        <Carousel>
          <CarouselContent>
            <CarouselItem>
              <div className="flex items-center justify-center h-16 bg-muted rounded-md text-sm font-medium">Slide 1</div>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
      </div>
    ),
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
    preview: () => (
      <Collapsible>
        <CollapsibleTrigger>
          <Button variant="ghost" size="sm">Toggle Content ▾</Button>
        </CollapsibleTrigger>
      </Collapsible>
    ),
  },
  {
    slug: 'command',
    title: 'Command',
    description: 'Search and command menu',
    tags: ['navigation'],
    preview: () => (
      <div className="w-full max-w-[200px] rounded-md border">
        <Command>
          <CommandInput placeholder="Type a command..." />
        </Command>
      </div>
    ),
  },
  {
    slug: 'combobox',
    title: 'Combobox',
    description: 'Autocomplete input with dropdown',
    tags: ['input'],
    preview: () => (
      <Combobox>
        <ComboboxTrigger className="w-[180px]">
          <ComboboxValue placeholder="Select framework..." />
        </ComboboxTrigger>
      </Combobox>
    ),
  },
  {
    slug: 'context-menu',
    title: 'Context Menu',
    description: 'Right-click menu at cursor position',
    tags: ['navigation'],
    preview: () => (
      <div className="flex items-center justify-center h-16 w-[160px] border border-dashed rounded-md text-xs text-muted-foreground">Right-click here</div>
    ),
  },
  {
    slug: 'data-table',
    title: 'Data Table',
    description: 'Sortable, filterable data table',
    tags: ['display'],
    preview: () => (
      <DataTableColumnHeader title="Amount" sorted="asc" onSort={() => {}} />
    ),
  },
  {
    slug: 'date-picker',
    title: 'Date Picker',
    description: 'Date selection with calendar popup',
    tags: ['input'],
    preview: () => (
      <DatePicker placeholder="Pick a date" />
    ),
  },
  {
    slug: 'dialog',
    title: 'Dialog',
    description: 'Modal overlay with custom content',
    tags: ['feedback'],
    preview: () => (
      <Button size="sm" variant="outline">Edit Profile</Button>
    ),
  },
  {
    slug: 'drawer',
    title: 'Drawer',
    description: 'Slide-out panel from screen edge',
    tags: ['layout'],
    preview: () => (
      <Button size="sm" variant="outline">Open Drawer</Button>
    ),
  },
  {
    slug: 'dropdown-menu',
    title: 'Dropdown Menu',
    description: 'Action menu triggered by a button',
    tags: ['navigation'],
    preview: () => (
      <Button size="sm" variant="outline" className="gap-1">
        Options
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </Button>
    ),
  },
  {
    slug: 'hover-card',
    title: 'Hover Card',
    description: 'Preview card on hover',
    tags: ['layout'],
    preview: () => (
      <span className="text-sm underline decoration-dotted underline-offset-4">@nextjs</span>
    ),
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
    preview: () => (
      <InputOTP maxLength={4}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    ),
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
    preview: () => (
      <Menubar>
        <MenubarMenu value="file"><MenubarTrigger>File</MenubarTrigger></MenubarMenu>
        <MenubarMenu value="edit"><MenubarTrigger>Edit</MenubarTrigger></MenubarMenu>
        <MenubarMenu value="view"><MenubarTrigger>View</MenubarTrigger></MenubarMenu>
      </Menubar>
    ),
  },
  {
    slug: 'navigation-menu',
    title: 'Navigation Menu',
    description: 'Hover-activated navigation links',
    tags: ['navigation'],
    preview: () => (
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <span className="text-sm font-medium">Getting Started</span>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <span className="text-sm font-medium">Components</span>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    ),
  },
  {
    slug: 'pagination',
    title: 'Pagination',
    description: 'Page navigation controls',
    tags: ['navigation'],
    preview: () => (
      <Pagination>
        <PaginationContent>
          <PaginationItem><span className="text-xs text-muted-foreground">‹ Previous</span></PaginationItem>
          <PaginationItem><span className="text-xs font-medium px-2.5 py-0.5 border rounded-md">1</span></PaginationItem>
          <PaginationItem><span className="text-xs px-2.5 py-0.5">2</span></PaginationItem>
          <PaginationItem><span className="text-xs text-muted-foreground">Next ›</span></PaginationItem>
        </PaginationContent>
      </Pagination>
    ),
  },
  {
    slug: 'popover',
    title: 'Popover',
    description: 'Floating content anchored to a trigger',
    tags: ['layout'],
    preview: () => (
      <Button size="sm" variant="outline">Open Popover</Button>
    ),
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
    preview: () => (
      <RadioGroup defaultValue="default">
        <div className="flex items-center gap-1.5">
          <RadioGroupItem value="default" />
          <Label className="text-xs">Default</Label>
        </div>
        <div className="flex items-center gap-1.5">
          <RadioGroupItem value="compact" />
          <Label className="text-xs">Compact</Label>
        </div>
      </RadioGroup>
    ),
  },
  {
    slug: 'resizable',
    title: 'Resizable',
    description: 'Draggable resize panels',
    tags: ['layout'],
    preview: () => (
      <div className="w-full max-w-[200px]">
        <ResizablePanelGroup direction="horizontal" className="rounded-md border">
          <ResizablePanel defaultSize={50}>
            <div className="flex items-center justify-center h-16 text-xs p-2">A</div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={50}>
            <div className="flex items-center justify-center h-16 text-xs p-2">B</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    ),
  },
  {
    slug: 'scroll-area',
    title: 'Scroll Area',
    description: 'Custom scrollbar container',
    tags: ['layout'],
    preview: () => (
      <ScrollArea className="h-[72px] w-full max-w-[180px] rounded-md border p-2">
        <div className="text-xs space-y-1">
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
          <div>Item 4</div>
          <div>Item 5</div>
        </div>
      </ScrollArea>
    ),
  },
  {
    slug: 'select',
    title: 'Select',
    description: 'Dropdown selection control',
    tags: ['input'],
    preview: () => (
      <Select>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select option..." />
        </SelectTrigger>
      </Select>
    ),
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
    preview: () => (
      <Button size="sm" variant="outline">Open Sheet</Button>
    ),
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
    preview: () => (
      <div className="w-full max-w-[200px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 text-xs">Name</TableHead>
              <TableHead className="h-8 text-xs text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="text-xs py-1.5">Alpha</TableCell>
              <TableCell className="text-xs py-1.5 text-right">$250</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    ),
  },
  {
    slug: 'tabs',
    title: 'Tabs',
    description: 'Tabbed content navigation',
    tags: ['navigation'],
    preview: () => (
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account" selected={true}>Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
      </Tabs>
    ),
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
    preview: () => (
      <ToggleGroup type="single" defaultValue="bold" variant="outline" size="sm">
        <ToggleGroupItem value="bold" className="font-bold">B</ToggleGroupItem>
        <ToggleGroupItem value="italic" className="italic">I</ToggleGroupItem>
        <ToggleGroupItem value="underline" className="underline">U</ToggleGroupItem>
      </ToggleGroup>
    ),
  },
  {
    slug: 'tooltip',
    title: 'Tooltip',
    description: 'Informational text on hover',
    tags: ['layout'],
    preview: () => (
      <Tooltip content="Add to library">
        <Button size="sm" variant="outline">Hover me</Button>
      </Tooltip>
    ),
  },
]

function ComponentCard({ entry }: { entry: CatalogEntry }) {
  const href = `/components/${entry.slug}`
  return (
    <a
      href={href}
      className="no-underline h-full"
      data-catalog-card
      data-tags={entry.tags.join(' ')}
    >
      <Card className="overflow-hidden py-0 gap-0 h-full hover:border-ring transition-colors">
        <CardContent className="flex items-center justify-center p-6 h-[120px] bg-muted/30 overflow-hidden">
          {entry.preview ? (
            entry.preview()
          ) : (
            <span className="text-2xl font-semibold text-muted-foreground/40 select-none">
              {entry.title.charAt(0)}
            </span>
          )}
        </CardContent>
        <CardHeader className="px-4 py-3 border-t border-border">
          <CardTitle className="text-sm">{entry.title}</CardTitle>
          <CardDescription className="mt-0.5">{entry.description}</CardDescription>
        </CardHeader>
      </Card>
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

      {/* Search + tag filter */}
      <CatalogFilter />

      {/* Card grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {catalogEntries.map(entry => (
          <ComponentCard entry={entry} />
        ))}
      </div>
    </div>
  )
}
