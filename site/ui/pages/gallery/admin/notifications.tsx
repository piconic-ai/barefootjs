import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminNotificationsDemo } from '@/components/gallery/admin/notifications-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminNotificationsPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" issueNumber={929} />
      <AdminShell currentRoute="notifications">
        <AdminNotificationsDemo />
      </AdminShell>
    </>
  )
}
