import { SaasShell } from '@/components/gallery/saas/saas-shell'
import { SaasLoginDemo } from '@/components/gallery/saas/login-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function SaasLoginPage() {
  return (
    <>
      <GalleryMeta appName="SaaS Marketing" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/saas" />
      <SaasShell currentRoute="login">
        <SaasLoginDemo />
      </SaasShell>
    </>
  )
}
