import { SaasShell } from '@/components/gallery/saas/saas-shell'
import { SaasBlogPostDemo } from '@/components/gallery/saas/blog-post-demo'
import { GalleryMeta } from '../admin/gallery-meta'

interface SaasBlogPostPageProps {
  slug: string
}

export function SaasBlogPostPage({ slug }: SaasBlogPostPageProps) {
  return (
    <>
      <GalleryMeta appName="SaaS Marketing" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/saas" />
      <SaasShell currentRoute="blog">
        <SaasBlogPostDemo slug={slug} />
      </SaasShell>
    </>
  )
}
