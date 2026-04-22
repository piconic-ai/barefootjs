import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminOverviewDemo } from '@/components/gallery/admin/overview-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminOverviewPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" sourceHref="https://github.com/barefootjs/barefootjs/tree/main/site/ui/components/gallery/admin" />
      <AdminShell currentRoute="overview">
        <AdminOverviewDemo />
      </AdminShell>
    </>
  )
}
