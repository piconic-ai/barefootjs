import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminOverviewDemo } from '@/components/gallery/admin/overview-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminOverviewPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" issueNumber={929} />
      <AdminShell currentRoute="overview">
        <AdminOverviewDemo />
      </AdminShell>
    </>
  )
}
