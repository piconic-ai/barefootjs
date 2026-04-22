import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminOrdersDemo } from '@/components/gallery/admin/orders-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminOrdersPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" sourceHref="https://github.com/barefootjs/barefootjs/tree/main/site/ui/components/gallery/admin" />
      <AdminShell currentRoute="orders">
        <AdminOrdersDemo />
      </AdminShell>
    </>
  )
}
