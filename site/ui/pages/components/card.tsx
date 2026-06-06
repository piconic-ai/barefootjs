/**
 * Card Reference Page (/components/card)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardImage,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
  CardFooter,
} from '@/components/ui/card'
import { CardPlayground } from '@/components/card-playground'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'image-card', title: 'Image Card', branch: 'start' },
  { id: 'stats-cards', title: 'Stats Cards', branch: 'child' },
  { id: 'profile-card', title: 'Profile Card', branch: 'child' },
  { id: 'login-form', title: 'Login Form', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `import {
  Card, CardHeader, CardTitle, CardDescription,
  CardContent, CardAction, CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function CardDemo() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          Enter your details below to create your account.
        </CardDescription>
        <CardAction>
          <Button variant="link">Login</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form>
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="John Doe" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="m@example.com" />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Create account</Button>
      </CardFooter>
    </Card>
  )
}`

const imageCardCode = `"use client"

import {
  Card,
  CardImage,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function TravelCard() {
  return (
    <Card className="w-[350px]">
      <CardImage
        src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800"
        alt="Mountain landscape"
      />
      <CardHeader>
        <CardTitle>Swiss Alps Adventure</CardTitle>
        <CardDescription>
          Experience breathtaking views on a 7-day guided hiking tour through
          the Swiss Alps, featuring scenic mountain trails and charming
          alpine villages.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" data-card-hover-action>
            View
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}`

const statsCardsCode = `"use client"

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card'

// Icon components for stats cards
function DollarIcon() {
  return (
    <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

export function StatsCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="min-w-[140px]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Total Sales</CardTitle>
          <DollarIcon />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">$45,231</p>
          <p className="text-xs text-muted-foreground">+20.1% from last month</p>
        </CardContent>
      </Card>
      <Card className="min-w-[140px]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Active Users</CardTitle>
          <UserIcon />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">2,350</p>
          <p className="text-xs text-muted-foreground">+180 since last hour</p>
        </CardContent>
      </Card>
    </div>
  )
}`

const profileCardCode = `"use client"

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

export function ProfileCard() {
  return (
    <Card className="w-[350px]">
      <CardHeader>
        <div className="flex items-center gap-4">
          <img
            src="https://api.dicebear.com/7.x/avataaars/svg?seed=Emily"
            alt="Emily Chen"
            className="h-12 w-12 rounded-full"
          />
          <div>
            <CardTitle>Emily Chen</CardTitle>
            <CardDescription>Senior Product Designer</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Email:</span>
          <span>emily.chen@example.com</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Phone:</span>
          <span>+1 (555) 123-4567</span>
        </div>
      </CardContent>
    </Card>
  )
}`

const loginFormCode = `"use client"

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Login to your account</CardTitle>
        <CardDescription>
          Enter your email below to login to your account
        </CardDescription>
        <CardAction>
          <Button variant="link">Sign Up</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form>
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="m@example.com" />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Button variant="link" className="ml-auto h-auto p-0">
                  Forgot your password?
                </Button>
              </div>
              <Input id="password" type="password" />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button type="submit" className="w-full">Login</Button>
      </CardFooter>
    </Card>
  )
}`

const cardProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Card sub-components (CardHeader, CardContent, CardFooter, etc.).',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes.',
  },
]

const cardImageProps: PropDefinition[] = [
  {
    name: 'src',
    type: 'string',
    description: 'Image source URL (required).',
  },
  {
    name: 'alt',
    type: 'string',
    description: 'Alternative text for the image (required).',
  },
  {
    name: 'width',
    type: 'number',
    description: 'Image width in pixels.',
  },
  {
    name: 'height',
    type: 'number',
    description: 'Image height in pixels.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes.',
  },
]

const cardHeaderProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Header content (CardTitle, CardDescription, CardAction).',
  },
]

const cardTitleProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Title text.',
  },
]

const cardDescriptionProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Description text.',
  },
]

const cardContentProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Main content of the card.',
  },
]

const cardActionProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Action elements positioned in the header (buttons, links).',
  },
]

const cardFooterProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Footer content (typically action buttons).',
  },
]

export function CardRefPage() {
  return (
    <DocPage slug="card" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Card"
          description="Displays a card with header, content, and footer."
          {...getNavLinks('card')}
        />

        {/* Props Playground */}
        <CardPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="@barefootjs/cli add card" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <Card className="w-full max-w-sm">
              <CardHeader>
                <CardTitle>Create account</CardTitle>
                <CardDescription>
                  Enter your details below to create your account.
                </CardDescription>
                <CardAction>
                  <Button variant="link">Login</Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <form>
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="card-name">Name</Label>
                      <Input id="card-name" placeholder="John Doe" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="card-email">Email</Label>
                      <Input id="card-email" type="email" placeholder="m@example.com" />
                    </div>
                  </div>
                </form>
              </CardContent>
              <CardFooter>
                <Button className="w-full">Create account</Button>
              </CardFooter>
            </Card>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Image Card" code={imageCardCode}>
              <Card className="w-[350px]">
                <CardImage
                  src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&dpr=2&q=80"
                  alt="Mountain landscape"
                />
                <CardHeader>
                  <CardTitle>Swiss Alps Adventure</CardTitle>
                  <CardDescription>
                    Experience breathtaking views on a 7-day guided hiking tour through the Swiss Alps, featuring scenic mountain trails and charming alpine villages.
                  </CardDescription>
                  <CardAction>
                    <Button variant="outline" size="sm" data-card-hover-action>
                      View
                    </Button>
                  </CardAction>
                </CardHeader>
              </Card>
            </Example>

            <Example title="Stats Cards" code={statsCardsCode}>
              <div className="grid gap-4 sm:grid-cols-2 w-full max-w-lg">
                <Card className="min-w-[140px]">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Total Sales</CardTitle>
                    <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">$45,231</p>
                    <p className="text-xs text-muted-foreground">+20.1% from last month</p>
                  </CardContent>
                </Card>
                <Card className="min-w-[140px]">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Active Users</CardTitle>
                    <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">2,350</p>
                    <p className="text-xs text-muted-foreground">+180 since last hour</p>
                  </CardContent>
                </Card>
              </div>
            </Example>

            <Example title="Profile Card" code={profileCardCode}>
              <Card className="w-[350px]">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <img
                      src="https://api.dicebear.com/7.x/avataaars/svg?seed=Emily"
                      alt="Emily Chen"
                      className="h-12 w-12 rounded-full"
                    />
                    <div>
                      <CardTitle>Emily Chen</CardTitle>
                      <CardDescription>Senior Product Designer</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Email:</span>
                    <span>emily.chen@example.com</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Phone:</span>
                    <span>+1 (555) 123-4567</span>
                  </div>
                </CardContent>
              </Card>
            </Example>

            <Example title="Login Form" code={loginFormCode}>
              <Card className="w-full max-w-sm">
                <CardHeader>
                  <CardTitle>Login to your account</CardTitle>
                  <CardDescription>
                    Enter your email below to login to your account
                  </CardDescription>
                  <CardAction>
                    <Button variant="link">Sign Up</Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <form>
                    <div className="flex flex-col gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="login-email">Email</Label>
                        <Input type="email" placeholder="m@example.com" />
                      </div>
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="login-password">Password</Label>
                          <Button variant="link" className="ml-auto h-auto p-0">
                            Forgot your password?
                          </Button>
                        </div>
                        <Input type="password" />
                      </div>
                    </div>
                  </form>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full">Login</Button>
                </CardFooter>
              </Card>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Card</h3>
              <PropsTable props={cardProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">CardImage</h3>
              <PropsTable props={cardImageProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">CardHeader</h3>
              <PropsTable props={cardHeaderProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">CardTitle</h3>
              <PropsTable props={cardTitleProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">CardDescription</h3>
              <PropsTable props={cardDescriptionProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">CardContent</h3>
              <PropsTable props={cardContentProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">CardAction</h3>
              <PropsTable props={cardActionProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">CardFooter</h3>
              <PropsTable props={cardFooterProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
