import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminSettingsDemo } from '@/components/gallery/admin/settings-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminSettingsPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" sourceHref="https://github.com/barefootjs/barefootjs/tree/main/site/ui/components/gallery/admin" />
      <AdminShell currentRoute="settings">
        <AdminSettingsDemo />
      </AdminShell>
    </>
  )
}
