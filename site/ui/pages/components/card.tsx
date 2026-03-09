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
          <PackageManagerTabs command="barefoot add card" />
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

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Card</h3>
              <PropsTable props={cardProps} />
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
