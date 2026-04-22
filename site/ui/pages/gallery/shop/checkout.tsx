import { ShopShell } from '@/components/gallery/shop/shop-shell'
import { CheckoutDemo } from '@/components/checkout-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function ShopCheckoutPage() {
  return (
    <>
      <GalleryMeta appName="E-Commerce Shop" sourceHref="https://github.com/barefootjs/barefootjs/tree/main/site/ui/components/gallery/shop" />
      <ShopShell currentRoute="checkout">
        <CheckoutDemo />
      </ShopShell>
    </>
  )
}
