"use client"

/**
 * Studio Canvas — "use client" component for the studio page canvas area.
 *
 * Renders all component preview islands with signal-based Data Table sorting.
 * Token panel remains server-rendered in studio.tsx (separate task).
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogTrigger, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
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
import { Calendar } from '@/components/ui/calendar'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { DatePicker } from '@/components/ui/date-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { DataTableColumnHeader } from '@/components/ui/data-table'

// ─── Helper components (stateless, inside "use client" file per BF003) ───

function GroupIsland(props: { title: string; children: any }) {
  return (
    <div className="rounded-xl border border-dashed border-border/40 bg-muted/20 p-3">
      <h2 className="text-xs font-semibold text-foreground mb-2">{props.title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {props.children}
      </div>
    </div>
  )
}

function PreviewItem(props: { name: string; children: any }) {
  return (
    <div className="group rounded-md px-2 pt-1 pb-2 min-w-0 overflow-hidden">
      <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-1 truncate block text-left" data-studio-detail={props.name}>
        {props.name}
      </button>
      <div className="flex items-center justify-center min-h-8 min-w-0">
        {props.children}
      </div>
    </div>
  )
}

// ─── Data Table sort data ────────────────────────────────────

type Task = { name: string; priority: string; priorityOrder: number }
const tasks: Task[] = [
  { name: 'Fix login bug', priority: 'High', priorityOrder: 1 },
  { name: 'Add tests', priority: 'Med', priorityOrder: 2 },
  { name: 'Update docs', priority: 'Low', priorityOrder: 3 },
]

// ─── Main canvas component ──────────────────────────────────

export function StudioCanvas() {
  // Data Table sort state
  const [sortKey, setSortKey] = createSignal<'name' | 'priority' | null>('name')
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('asc')

  // Alert Dialog state
  const [alertDialogOpen, setAlertDialogOpen] = createSignal(false)

  const handleSort = (key: 'name' | 'priority') => {
    if (sortKey() === key) {
      setSortDir(sortDir() === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedTasks = createMemo(() => {
    const key = sortKey()
    if (!key) return tasks
    const dir = sortDir()
    return /* @client */ [...tasks].sort((a, b) => {
      const aVal = key === 'priority' ? a.priorityOrder : a.name
      const bVal = key === 'priority' ? b.priorityOrder : b.name
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return dir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  })

  return (
    <div className="space-y-4 p-4 lg:pl-68">
      {/* Input & Form Controls */}
      <GroupIsland title="Input & Form Controls">
        <PreviewItem name="Button">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" className="h-7 text-[11px] px-2">Primary</Button>
            <Button variant="outline" size="sm" className="h-7 text-[11px] px-2">Outline</Button>
            <Button variant="secondary" size="sm" className="h-7 text-[11px] px-2">Secondary</Button>
            <Button variant="destructive" size="sm" className="h-7 text-[11px] px-2">Destructive</Button>
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
          <RadioGroup defaultValue="a" className="gap-1.5">
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="a" />
              <Label className="text-[11px]">Option A</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="b" />
              <Label className="text-[11px]">Option B</Label>
            </div>
          </RadioGroup>
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
          <div className="origin-top-left" style="transform: scale(0.78); width: 128%; margin-bottom: -50px">
            <Calendar />
          </div>
        </PreviewItem>

        <PreviewItem name="Date Picker">
          <DatePicker triggerClassName="h-7 text-[11px] w-full" />
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
          <InputOTP maxLength={4}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </PreviewItem>

        <PreviewItem name="Toggle Group">
          <ToggleGroup type="multiple" variant="outline" size="sm" defaultValue={["bold"]}>
            <ToggleGroupItem value="bold" className="h-7 px-2 text-[11px]">B</ToggleGroupItem>
            <ToggleGroupItem value="italic" className="h-7 px-2 text-[11px]">I</ToggleGroupItem>
            <ToggleGroupItem value="underline" className="h-7 px-2 text-[11px]">U</ToggleGroupItem>
          </ToggleGroup>
        </PreviewItem>
      </GroupIsland>

      {/* Display & Data */}
      <GroupIsland title="Display & Data">
        <PreviewItem name="Card">
          <Card className="w-full">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center gap-2.5">
                <Avatar className="size-9 bg-muted">
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <CardTitle className="text-[11px] leading-tight">Emily Chen</CardTitle>
                  <CardDescription className="text-[10px] leading-tight">Product Designer</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardFooter className="px-3 pb-2.5 pt-0 gap-1.5">
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2.5 flex-1">Message</Button>
              <Button size="sm" className="h-6 text-[10px] px-2.5 flex-1">Follow</Button>
            </CardFooter>
          </Card>
        </PreviewItem>

        <PreviewItem name="Badge">
          <div className="flex flex-wrap gap-1">
            <Badge className="text-[9px] px-1.5 py-0.5">Default</Badge>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5">Secondary</Badge>
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0.5">Destructive</Badge>
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
            <div className="flex border-b border-border py-0.5 font-medium text-muted-foreground"><span className="flex-1">Name</span><span className="w-10 text-right">Role</span><span className="w-12 text-right">Status</span></div>
            <div className="flex border-b border-border py-0.5 text-foreground"><span className="flex-1">Alice</span><span className="w-10 text-right text-muted-foreground">Admin</span><span className="w-12 text-right">Active</span></div>
            <div className="flex py-0.5 text-foreground"><span className="flex-1">Bob</span><span className="w-10 text-right text-muted-foreground">Editor</span><span className="w-12 text-right">Draft</span></div>
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
          <AspectRatio ratio={16 / 9} className="w-full rounded-md bg-muted flex items-center justify-center text-[11px] text-muted-foreground">
            16:9
          </AspectRatio>
        </PreviewItem>

        <PreviewItem name="Data Table">
          <div className="w-full border border-border rounded-md overflow-hidden">
            <Table className="text-[10px]">
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="h-7 px-1.5">
                    <DataTableColumnHeader
                      title="Task"
                      sorted={sortKey() === 'name' ? sortDir() : false}
                      onSort={() => handleSort('name')}
                      className="text-[10px]"
                    />
                  </TableHead>
                  <TableHead className="h-7 px-1.5 text-right">
                    <DataTableColumnHeader
                      title="Priority"
                      sorted={sortKey() === 'priority' ? sortDir() : false}
                      onSort={() => handleSort('priority')}
                      className="text-[10px]"
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTasks().map((task: Task) => (
                  <TableRow className="border-border">
                    <TableCell className="px-1.5 py-1">{task.name}</TableCell>
                    <TableCell className={`px-1.5 py-1 text-right ${task.priorityOrder === 1 ? 'text-destructive' : task.priorityOrder === 3 ? 'text-muted-foreground' : ''}`}>
                      {task.priority}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </PreviewItem>

        <PreviewItem name="Carousel">
          <div className="w-full px-12">
            <Carousel>
              <CarouselContent>
                <CarouselItem><div className="flex items-center justify-center h-16 rounded-md bg-muted text-[11px] text-muted-foreground">1</div></CarouselItem>
                <CarouselItem><div className="flex items-center justify-center h-16 rounded-md bg-muted text-[11px] text-muted-foreground">2</div></CarouselItem>
                <CarouselItem><div className="flex items-center justify-center h-16 rounded-md bg-muted text-[11px] text-muted-foreground">3</div></CarouselItem>
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
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
          <AlertDialog open={alertDialogOpen()} onOpenChange={setAlertDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-[11px] px-2">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogOverlay />
            <AlertDialogContent ariaLabelledby="studio-alert-title" ariaDescribedby="studio-alert-desc">
              <AlertDialogHeader>
                <AlertDialogTitle id="studio-alert-title">Are you sure?</AlertDialogTitle>
                <AlertDialogDescription id="studio-alert-desc">This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Continue</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
