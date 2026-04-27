import { ProductivityShell } from '@/components/gallery/productivity/productivity-shell'
import { ProductivityCalendarDemo } from '@/components/gallery/productivity/calendar-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function ProductivityCalendarPage() {
  return (
    <>
      <GalleryMeta appName="Productivity Suite" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/productivity" />
      <ProductivityShell currentRoute="calendar">
        <ProductivityCalendarDemo />
      </ProductivityShell>
    </>
  )
}
