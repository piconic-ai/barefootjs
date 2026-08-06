"use client"

/**
 * Aspect Ratio Demo Components
 */

import { AspectRatio } from '@/components/ui/aspect-ratio'

export function AspectRatioPreviewDemo() {
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
}

export function AspectRatioBasicDemo() {
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
}
