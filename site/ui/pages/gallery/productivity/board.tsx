import { ProductivityShell } from '@/components/gallery/productivity/productivity-shell'
import { ProductivityBoardDemo } from '@/components/gallery/productivity/board-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function ProductivityBoardPage() {
  return (
    <>
      <GalleryMeta appName="Productivity Suite" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/productivity" />
      <ProductivityShell currentRoute="board">
        <ProductivityBoardDemo />
      </ProductivityShell>
    </>
  )
}
