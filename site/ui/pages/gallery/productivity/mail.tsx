import { ProductivityShell } from '@/components/gallery/productivity/productivity-shell'
import { ProductivityMailDemo } from '@/components/gallery/productivity/mail-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function ProductivityMailPage() {
  return (
    <>
      <GalleryMeta appName="Productivity Suite" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/productivity" />
      <ProductivityShell currentRoute="mail">
        <ProductivityMailDemo />
      </ProductivityShell>
    </>
  )
}
