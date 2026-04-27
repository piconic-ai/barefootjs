import { SocialShell } from '@/components/gallery/social/social-shell'
import { SocialFeedPageDemo } from '@/components/gallery/social/feed-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function SocialFeedPage() {
  return (
    <>
      <GalleryMeta appName="Social App" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/social" />
      <SocialShell currentRoute="feed">
        <SocialFeedPageDemo />
      </SocialShell>
    </>
  )
}
