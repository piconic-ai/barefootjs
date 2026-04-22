import { ShopShell } from '@/components/gallery/shop/shop-shell'
import { ShopCartDemo } from '@/components/gallery/shop/cart-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function ShopCartPage() {
  return (
    <>
      <GalleryMeta appName="E-Commerce Shop" sourceHref="https://github.com/barefootjs/barefootjs/tree/main/site/ui/components/gallery/shop" />
      <ShopShell currentRoute="cart">
        <ShopCartDemo />
      </ShopShell>
    </>
  )
}
