import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminNotificationsDemo } from '@/components/gallery/admin/notifications-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminNotificationsPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" sourceHref="https://github.com/barefootjs/barefootjs/tree/main/site/ui/components/gallery/admin" />
      <AdminShell currentRoute="notifications">
        <AdminNotificationsDemo />
      </AdminShell>
    </>
  )
}
