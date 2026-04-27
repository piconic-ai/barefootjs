import { ProductivityShell } from '@/components/gallery/productivity/productivity-shell'
import { ProductivityFilesDemo } from '@/components/gallery/productivity/files-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function ProductivityFilesPage() {
  return (
    <>
      <GalleryMeta appName="Productivity Suite" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/productivity" />
      <ProductivityShell currentRoute="files">
        <ProductivityFilesDemo />
      </ProductivityShell>
    </>
  )
}
