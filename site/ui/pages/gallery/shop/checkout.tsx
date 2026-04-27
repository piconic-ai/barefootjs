import { ShopShell } from '@/components/gallery/shop/shop-shell'
import { ShopCheckoutDemo } from '@/components/gallery/shop/checkout-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function ShopCheckoutPage() {
  return (
    <>
      <GalleryMeta appName="E-Commerce Shop" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/shop" />
      <ShopShell currentRoute="checkout">
        <ShopCheckoutDemo />
      </ShopShell>
    </>
  )
}
