"use client"
/**
 * ScrollArea Demo Components
 *
 * Interactive demos for ScrollArea component.
 * Based on shadcn/ui examples.
 */

import { ScrollArea } from '@ui/components/ui/scroll-area'
import { Separator } from '@ui/components/ui/separator'

const tags = Array.from({ length: 50 }).map(
  (_, i, a) => `v1.2.0-beta.${a.length - i}`
)

/**
 * Tags list — classic shadcn/ui scroll-area example.
 * Fixed-height container with vertical scroll.
 */
export function ScrollAreaTagsDemo() {
  return (
    <ScrollArea className="h-72 w-48 rounded-md border border-border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Tags</h4>
        {tags.map((tag) => (
          <div>
            <div className="text-sm" data-tag={tag}>{tag}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

/**
 * Horizontal scroll — artwork gallery.
 */
export function ScrollAreaHorizontalDemo() {
  const works = [
    { artist: 'Ornella Binni', title: 'Sunset Horizon' },
    { artist: 'Tom Byrom', title: 'Mountain Peak' },
    { artist: 'Vladimir Malyutin', title: 'City Lights' },
    { artist: 'Ornella Binni', title: 'Ocean Waves' },
    { artist: 'Tom Byrom', title: 'Forest Trail' },
    { artist: 'Vladimir Malyutin', title: 'Night Sky' },
    { artist: 'Ornella Binni', title: 'Desert Dunes' },
  ]

  return (
    <ScrollArea className="w-96 whitespace-nowrap rounded-md border border-border">
      <div className="flex w-max space-x-4 p-4">
        {works.map((work) => (
          <figure className="shrink-0">
            <div className="overflow-hidden rounded-md">
              <div className="h-[150px] w-[200px] bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground">{work.title}</span>
              </div>
            </div>
            <figcaption className="pt-2 text-xs text-muted-foreground">
              Photo by{' '}
              <span className="font-semibold text-foreground">{work.artist}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </ScrollArea>
  )
}

/**
 * Both axes — content wider and taller than container.
 */
export function ScrollAreaBothAxesDemo() {
  return (
    <ScrollArea className="h-64 w-80 rounded-md border border-border">
      <div className="p-4" style="width: 600px;">
        <h4 className="mb-4 text-sm font-medium leading-none">Changelog</h4>
        <div className="space-y-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div className="whitespace-nowrap">
              <div className="text-sm font-medium">Release v{20 - i}.0.0</div>
              <p className="text-sm text-muted-foreground">
                Added new features, fixed bugs, and improved performance across multiple modules and packages.
              </p>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
