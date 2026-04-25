"use client"

/**
 * Carousel Demo Components
 */

import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel'

export function CarouselPreviewDemo() {
  return (
    <div className="w-full max-w-xs mx-auto">
      <Carousel>
        <CarouselContent>
          {[1, 2, 3, 4, 5].map((n) => (
            <CarouselItem key={n}>
              <div className="p-1">
                <div className="flex items-center justify-center rounded-lg border bg-card p-6 aspect-square">
                  <span className="text-4xl font-semibold">{n}</span>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  )
}

export function CarouselSizesDemo() {
  return (
    <div className="w-full max-w-sm mx-auto">
      <Carousel>
        <CarouselContent className="-ml-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <CarouselItem key={n} className="pl-2 basis-1/3">
              <div className="p-1">
                <div className="flex items-center justify-center rounded-lg border bg-card p-4 aspect-square">
                  <span className="text-2xl font-semibold">{n}</span>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  )
}

export function CarouselOrientationDemo() {
  return (
    <div className="w-full max-w-xs mx-auto">
      <Carousel orientation="vertical" opts={{ align: 'start' }}>
        <CarouselContent orientation="vertical" className="h-[200px]">
          {[1, 2, 3, 4, 5].map((n) => (
            <CarouselItem key={n} orientation="vertical" className="basis-1/2">
              <div className="p-1">
                <div className="flex items-center justify-center rounded-lg border bg-card p-4">
                  <span className="text-2xl font-semibold">{n}</span>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious orientation="vertical" />
        <CarouselNext orientation="vertical" />
      </Carousel>
    </div>
  )
}
