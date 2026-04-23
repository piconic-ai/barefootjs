import { SaasShell } from '@/components/gallery/saas/saas-shell'
import { SaasBlogIndexDemo } from '@/components/gallery/saas/blog-index-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function SaasBlogPage() {
  return (
    <>
      <GalleryMeta appName="SaaS Marketing" sourceHref="https://github.com/barefootjs/barefootjs/tree/main/site/ui/components/gallery/saas" />
      <SaasShell currentRoute="blog">
        <SaasBlogIndexDemo />
      </SaasShell>
    </>
  )
}
