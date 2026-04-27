import { ShopShell } from '@/components/gallery/shop/shop-shell'
import { ShopCatalogDemo } from '@/components/gallery/shop/catalog-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function ShopCatalogPage() {
  return (
    <>
      <GalleryMeta appName="E-Commerce Shop" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/shop" />
      <ShopShell currentRoute="catalog">
        <ShopCatalogDemo />
      </ShopShell>
    </>
  )
}
