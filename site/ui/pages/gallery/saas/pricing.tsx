import { SaasShell } from '@/components/gallery/saas/saas-shell'
import { SaasPricingDemo } from '@/components/gallery/saas/pricing-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function SaasPricingPage() {
  return (
    <>
      <GalleryMeta appName="SaaS Marketing" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/saas" />
      <SaasShell currentRoute="pricing">
        <SaasPricingDemo />
      </SaasShell>
    </>
  )
}
