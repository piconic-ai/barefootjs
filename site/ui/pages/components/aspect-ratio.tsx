/**
 * Aspect Ratio Reference Page (/components/aspect-ratio)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { AspectRatio } from '@/components/ui/aspect-ratio'
import { AspectRatioPlayground } from '@/components/aspect-ratio-playground'
import { AspectRatioPreviewDemo } from '@/components/aspect-ratio-demo'
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
  { id: 'examples', title: 'Examples' },
  { id: 'image', title: 'Image', branch: 'start' },
  { id: 'ratios', title: 'Ratios' },
  { id: 'api-reference', title: 'API Reference' },
]

const imageCode = `import { AspectRatio } from "@/components/ui/aspect-ratio"

function AspectRatioDemo() {
  return (
    <div className="w-full max-w-md">
      <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg bg-muted">
        <img
          src="https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&dpr=2&q=80"
          alt="Photo by Drew Beamer"
          className="object-cover w-full h-full"
        />
      </AspectRatio>
    </div>
  )
}`

const ratiosCode = `import { AspectRatio } from "@/components/ui/aspect-ratio"

function AspectRatioDemo() {
  return (
    <div className="grid grid-cols-3 gap-4 w-full max-w-2xl">
      <div>
        <p className="text-sm text-muted-foreground mb-2">1:1</p>
        <AspectRatio ratio={1} className="overflow-hidden rounded-lg">
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-sm text-muted-foreground">1:1</span>
          </div>
        </AspectRatio>
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-2">16:9</p>
        <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg">
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-sm text-muted-foreground">16:9</span>
          </div>
        </AspectRatio>
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-2">4:3</p>
        <AspectRatio ratio={4 / 3} className="overflow-hidden rounded-lg">
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-sm text-muted-foreground">4:3</span>
          </div>
        </AspectRatio>
      </div>
    </div>
  )
}`

const aspectRatioProps: PropDefinition[] = [
  {
    name: 'ratio',
    type: 'number',
    defaultValue: '1',
    description: 'The desired width-to-height ratio (e.g. 16/9, 4/3).',
  },
  {
    name: 'children',
    type: 'Child',
    description: 'Content to display within the aspect ratio container.',
  },
  {
    name: 'className',
    type: 'string',
    defaultValue: "''",
    description: 'Additional CSS classes.',
  },
]

export function AspectRatioRefPage() {
  return (
    <DocPage slug="aspect-ratio" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Aspect Ratio"
          description="Displays content within a desired ratio."
          {...getNavLinks('aspect-ratio')}
        />

        {/* Props Playground */}
        <AspectRatioPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="@barefootjs/cli add aspect-ratio" />
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Image" code={imageCode}>
              <AspectRatioPreviewDemo />
            </Example>

            <Example title="Ratios" code={ratiosCode}>
              <div className="grid grid-cols-3 gap-4 w-full max-w-2xl">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">1:1</p>
                  <AspectRatio ratio={1} className="overflow-hidden rounded-lg">
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <span className="text-sm text-muted-foreground">1:1</span>
                    </div>
                  </AspectRatio>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">16:9</p>
                  <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg">
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <span className="text-sm text-muted-foreground">16:9</span>
                    </div>
                  </AspectRatio>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">4:3</p>
                  <AspectRatio ratio={4 / 3} className="overflow-hidden rounded-lg">
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <span className="text-sm text-muted-foreground">4:3</span>
                    </div>
                  </AspectRatio>
                </div>
              </div>
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={aspectRatioProps} />
        </Section>
      </div>
    </DocPage>
  )
}
