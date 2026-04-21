import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminOrdersDemo } from '@/components/gallery/admin/orders-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminOrdersPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" issueNumber={929} />
      <AdminShell currentRoute="orders">
        <AdminOrdersDemo />
      </AdminShell>
    </>
  )
}
