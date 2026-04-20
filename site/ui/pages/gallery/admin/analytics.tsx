import { AdminShell } from '@/components/gallery/admin/admin-shell'
import { AdminAnalyticsDemo } from '@/components/gallery/admin/analytics-demo'
import { GalleryMeta } from './gallery-meta'

export function AdminAnalyticsPage() {
  return (
    <>
      <GalleryMeta appName="Admin Dashboard" issueNumber={929} />
      <AdminShell currentRoute="analytics">
        <AdminAnalyticsDemo />
      </AdminShell>
    </>
  )
}
