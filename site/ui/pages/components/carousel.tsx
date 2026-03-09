/**
 * Carousel Reference Page (/components/carousel)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel'
import { CarouselPlayground } from '@/components/carousel-playground'
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
  Carousel, CarouselContent, CarouselItem,
  CarouselPrevious, CarouselNext,
} from "@/components/ui/carousel"

function CarouselDemo() {
  return (
    <Carousel className="w-full max-w-xs">
      <CarouselContent>
        {Array.from({ length: 5 }, (_, i) => (
          <CarouselItem>
            <div className="flex aspect-square items-center justify-center rounded-lg border bg-card p-6">
              <span className="text-4xl font-semibold">{i + 1}</span>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  )
}`

const carouselProps: PropDefinition[] = [
  {
    name: 'orientation',
    type: "'horizontal' | 'vertical'",
    defaultValue: "'horizontal'",
    description: 'The scroll direction of the carousel.',
  },
  {
    name: 'opts',
    type: 'EmblaOptionsType',
    description: 'Embla Carousel options (align, loop, etc.).',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes.',
  },
]

const carouselItemProps: PropDefinition[] = [
  {
    name: 'children',
    type: 'Child',
    description: 'Slide content.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Additional CSS classes (e.g. basis-1/3 for partial slides).',
  },
]

export function CarouselRefPage() {
  return (
    <DocPage slug="carousel" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Carousel"
          description="A carousel with motion and swipe built on top of Embla Carousel."
          {...getNavLinks('carousel')}
        />

        {/* Props Playground */}
        <CarouselPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add carousel" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <Carousel className="w-full max-w-xs mx-auto">
              <CarouselContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <CarouselItem>
                    <div className="flex aspect-square items-center justify-center rounded-lg border bg-card p-6">
                      <span className="text-4xl font-semibold">{n}</span>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </Example>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Carousel</h3>
              <PropsTable props={carouselProps} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">CarouselItem</h3>
              <PropsTable props={carouselItemProps} />
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
