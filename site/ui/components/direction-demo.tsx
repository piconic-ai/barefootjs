import { DirectionProvider } from '@ui/components/ui/direction'
import { Input } from '@ui/components/ui/input'

export function DirectionBasicDemo() {
  return (
    <div className="flex flex-col gap-4 max-w-md">
      <DirectionProvider dir="ltr">
        <div className="rounded-md border border-border p-4">
          <p className="text-sm font-medium mb-1">Left-to-Right (LTR)</p>
          <p className="text-sm text-muted-foreground">This text flows from left to right. Numbers like 123 appear naturally.</p>
        </div>
      </DirectionProvider>
      <DirectionProvider dir="rtl">
        <div className="rounded-md border border-border p-4">
          <p className="text-sm font-medium mb-1">Right-to-Left (RTL)</p>
          <p className="text-sm text-muted-foreground">هذا النص يتدفق من اليمين إلى اليسار. الأرقام مثل 123 تظهر بشكل طبيعي.</p>
        </div>
      </DirectionProvider>
    </div>
  )
}

export function DirectionNestedDemo() {
  return (
    <div className="max-w-md">
      <DirectionProvider dir="rtl">
        <div className="rounded-md border border-border p-4 space-y-3">
          <p className="text-sm font-medium">محتوى RTL خارجي</p>
          <p className="text-sm text-muted-foreground">هذا القسم يستخدم اتجاه من اليمين إلى اليسار.</p>
          <DirectionProvider dir="ltr">
            <div className="rounded-md border border-border bg-muted/50 p-3">
              <p className="text-sm font-medium">Nested LTR content</p>
              <p className="text-sm text-muted-foreground">This section overrides to left-to-right inside an RTL parent.</p>
            </div>
          </DirectionProvider>
        </div>
      </DirectionProvider>
    </div>
  )
}

export function DirectionFormDemo() {
  return (
    <div className="flex flex-col gap-4 max-w-md">
      <DirectionProvider dir="rtl">
        <div className="rounded-md border border-border p-4 space-y-3">
          <h4 className="text-sm font-medium">نموذج تسجيل</h4>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">الاسم</label>
            <Input type="text" placeholder="أدخل اسمك" />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">البريد الإلكتروني</label>
            <Input type="email" placeholder="أدخل بريدك الإلكتروني" />
          </div>
        </div>
      </DirectionProvider>
    </div>
  )
}
