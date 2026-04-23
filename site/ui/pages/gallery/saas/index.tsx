import { SaasShell } from '@/components/gallery/saas/saas-shell'
import { SaasLandingDemo } from '@/components/gallery/saas/landing-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function SaasLandingPage() {
  return (
    <>
      <GalleryMeta appName="SaaS Marketing" sourceHref="https://github.com/barefootjs/barefootjs/tree/main/site/ui/components/gallery/saas" />
      <SaasShell currentRoute="landing">
        <SaasLandingDemo />
      </SaasShell>
    </>
  )
}
