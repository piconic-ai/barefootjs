import { SocialShell } from '@/components/gallery/social/social-shell'
import { SocialThreadDemo } from '@/components/gallery/social/thread-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function SocialThreadPage() {
  return (
    <>
      <GalleryMeta appName="Social App" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/social" />
      <SocialShell currentRoute="thread">
        <SocialThreadDemo />
      </SocialShell>
    </>
  )
}
