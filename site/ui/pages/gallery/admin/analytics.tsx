import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminAnalyticsDemo } from '@/components/gallery/admin/analytics-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminAnalyticsPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" sourceHref="https://github.com/barefootjs/barefootjs/tree/main/site/ui/components/gallery/admin" />
      <AdminShell currentRoute="analytics">
        <AdminAnalyticsDemo />
      </AdminShell>
    </>
  )
}
