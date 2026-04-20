import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminSettingsDemo } from '@/components/gallery/admin/settings-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminSettingsPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" issueNumber={929} />
      <AdminShell currentRoute="settings">
        <AdminSettingsDemo />
      </AdminShell>
    </>
  )
}
