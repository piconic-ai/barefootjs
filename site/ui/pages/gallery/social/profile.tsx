import { SocialShell } from '@/components/gallery/social/social-shell'
import { SocialProfileDemo } from '@/components/gallery/social/profile-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function SocialProfilePage() {
  return (
    <>
      <GalleryMeta appName="Social App" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/social" />
      <SocialShell currentRoute="profile">
        <SocialProfileDemo />
      </SocialShell>
    </>
  )
}
