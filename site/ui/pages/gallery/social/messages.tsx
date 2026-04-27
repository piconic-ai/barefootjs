import { SocialShell } from '@/components/gallery/social/social-shell'
import { SocialMessagesDemo } from '@/components/gallery/social/messages-demo'
import { GalleryMeta } from '../admin/gallery-meta'

export function SocialMessagesPage() {
  return (
    <>
      <GalleryMeta appName="Social App" sourceHref="https://github.com/piconic-ai/barefootjs/tree/main/site/ui/components/gallery/social" />
      <SocialShell currentRoute="messages">
        <SocialMessagesDemo />
      </SocialShell>
    </>
  )
}
