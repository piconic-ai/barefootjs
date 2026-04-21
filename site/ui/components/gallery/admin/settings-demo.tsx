"use client"

import { createSignal, createMemo } from '@barefootjs/client'
import { Input } from '@ui/components/ui/input'
import { Button } from '@ui/components/ui/button'
import { Textarea } from '@ui/components/ui/textarea'
import { Switch } from '@ui/components/ui/switch'
import { NativeSelect, NativeSelectOption } from '@ui/components/ui/native-select'
import { Avatar, AvatarFallback } from '@ui/components/ui/avatar'
import { Separator } from '@ui/components/ui/separator'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@ui/components/ui/tabs'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@ui/components/ui/card'
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldError,
} from '@ui/components/ui/field'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

export function AdminSettingsDemo() {
  const [activeTab, setActiveTab] = createSignal('profile')
  const isProfileSelected = createMemo(() => activeTab() === 'profile')
  const isTeamSelected = createMemo(() => activeTab() === 'team')
  const isNotificationsSelected = createMemo(() => activeTab() === 'notifications')

  const [displayName, setDisplayName] = createSignal('Alex Admin')
  const [profileEmail, setProfileEmail] = createSignal('alex@acme.com')
  const [bio, setBio] = createSignal('Head of operations at Acme.')
  const [profileSaving, setProfileSaving] = createSignal(false)

  const [teamName, setTeamName] = createSignal('Acme Operations')
  const [teamTimezone, setTeamTimezone] = createSignal('America/New_York')
  const [teamSaving, setTeamSaving] = createSignal(false)

  const [emailNotifications, setEmailNotifications] = createSignal(true)
  const [pushNotifications, setPushNotifications] = createSignal(false)
  const [marketingEmails, setMarketingEmails] = createSignal(false)
  const [securityAlerts, setSecurityAlerts] = createSignal(true)
  const [digestFrequency, setDigestFrequency] = createSignal('weekly')
  const [notificationsSaving, setNotificationsSaving] = createSignal(false)

  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  const displayNameError = createMemo(() => {
    if (displayName().trim() === '') return 'Display name is required'
    return ''
  })

  const teamNameError = createMemo(() => {
    if (teamName().trim() === '') return 'Team name is required'
    return ''
  })

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  const handleProfileSave = async () => {
    if (displayNameError() !== '' || profileSaving()) return
    setProfileSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 800))
    setProfileSaving(false)
    showToast('Profile updated successfully')
  }

  const handleTeamSave = async () => {
    if (teamNameError() !== '' || teamSaving()) return
    setTeamSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 800))
    setTeamSaving(false)
    showToast('Team settings saved')
  }

  const handleNotificationsSave = async () => {
    if (notificationsSaving()) return
    setNotificationsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 800))
    setNotificationsSaving(false)
    showToast('Notification preferences saved')
  }

  return (
    <div className="w-full max-w-2xl">
      <Tabs value={activeTab()} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger
            value="profile"
            selected={isProfileSelected()}
            disabled={false}
            onClick={() => setActiveTab('profile')}
          >
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="team"
            selected={isTeamSelected()}
            disabled={false}
            onClick={() => setActiveTab('team')}
          >
            Team
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            selected={isNotificationsSelected()}
            disabled={false}
            onClick={() => setActiveTab('notifications')}
          >
            Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" selected={isProfileSelected()}>
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Manage how your account appears to the team.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={(e: Event) => e.preventDefault()}>
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="text-lg">AA</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Profile photo</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG or GIF. 1MB max.</p>
                    <Button variant="outline" size="sm">
                      Upload
                    </Button>
                  </div>
                </div>

                <Separator />

                <Field data-invalid={displayNameError() !== '' || undefined}>
                  <FieldLabel for="admin-settings-name">Display Name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="admin-settings-name"
                      value={displayName()}
                      onInput={(e: Event) => setDisplayName((e.target as HTMLInputElement).value)}
                      aria-invalid={displayNameError() !== '' || undefined}
                    />
                    {displayNameError() !== '' ? <FieldError>{displayNameError()}</FieldError> : null}
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel for="admin-settings-email">Email</FieldLabel>
                  <FieldContent>
                    <Input
                      id="admin-settings-email"
                      type="email"
                      value={profileEmail()}
                      onInput={(e: Event) => setProfileEmail((e.target as HTMLInputElement).value)}
                    />
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel for="admin-settings-bio">Bio</FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="admin-settings-bio"
                      placeholder="Tell us about yourself"
                      value={bio()}
                      onInput={(e: Event) => setBio((e.target as HTMLTextAreaElement).value)}
                    />
                  </FieldContent>
                </Field>

                <div className="flex justify-end">
                  <Button
                    onClick={handleProfileSave}
                    disabled={displayNameError() !== '' || profileSaving()}
                    className="admin-settings-save-profile"
                  >
                    {profileSaving() ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" selected={isTeamSelected()}>
          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>Control workspace-wide settings.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={(e: Event) => e.preventDefault()}>
                <Field data-invalid={teamNameError() !== '' || undefined}>
                  <FieldLabel for="admin-team-name">Team Name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="admin-team-name"
                      value={teamName()}
                      onInput={(e: Event) => setTeamName((e.target as HTMLInputElement).value)}
                      aria-invalid={teamNameError() !== '' || undefined}
                    />
                    {teamNameError() !== '' ? <FieldError>{teamNameError()}</FieldError> : null}
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel for="admin-team-tz">Default Timezone</FieldLabel>
                  <FieldContent>
                    <NativeSelect
                      id="admin-team-tz"
                      value={teamTimezone()}
                      onChange={(e: Event) => setTeamTimezone((e.target as HTMLSelectElement).value)}
                    >
                      <NativeSelectOption value="America/New_York">America / New York</NativeSelectOption>
                      <NativeSelectOption value="America/Los_Angeles">America / Los Angeles</NativeSelectOption>
                      <NativeSelectOption value="Europe/London">Europe / London</NativeSelectOption>
                      <NativeSelectOption value="Asia/Tokyo">Asia / Tokyo</NativeSelectOption>
                    </NativeSelect>
                  </FieldContent>
                </Field>

                <div className="flex justify-end">
                  <Button
                    onClick={handleTeamSave}
                    disabled={teamNameError() !== '' || teamSaving()}
                    className="admin-settings-save-team"
                  >
                    {teamSaving() ? 'Saving...' : 'Save team'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" selected={isNotificationsSelected()}>
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Configure how your team gets notified.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={(e: Event) => e.preventDefault()}>
                <div className="rounded-lg border divide-y divide-border">
                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Email Notifications</label>
                      <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                    </div>
                    <Switch checked={emailNotifications()} onCheckedChange={setEmailNotifications} />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Push Notifications</label>
                      <p className="text-sm text-muted-foreground">Receive push notifications in browser</p>
                    </div>
                    <Switch checked={pushNotifications()} onCheckedChange={setPushNotifications} />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Marketing Emails</label>
                      <p className="text-sm text-muted-foreground">Receive emails about new features</p>
                    </div>
                    <Switch checked={marketingEmails()} onCheckedChange={setMarketingEmails} />
                  </div>

                  <div className="flex items-center justify-between p-4">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium">Security Alerts</label>
                      <p className="text-sm text-muted-foreground">Important security notifications</p>
                    </div>
                    <Switch checked={securityAlerts()} onCheckedChange={setSecurityAlerts} />
                  </div>
                </div>

                <Field>
                  <FieldLabel for="admin-digest-frequency">Digest Frequency</FieldLabel>
                  <FieldContent>
                    <NativeSelect
                      id="admin-digest-frequency"
                      value={digestFrequency()}
                      onChange={(e: Event) => setDigestFrequency((e.target as HTMLSelectElement).value)}
                    >
                      <NativeSelectOption value="realtime">Real-time</NativeSelectOption>
                      <NativeSelectOption value="daily">Daily digest</NativeSelectOption>
                      <NativeSelectOption value="weekly">Weekly digest</NativeSelectOption>
                      <NativeSelectOption value="never">Never</NativeSelectOption>
                    </NativeSelect>
                  </FieldContent>
                </Field>

                <div className="flex justify-end">
                  <Button
                    onClick={handleNotificationsSave}
                    disabled={notificationsSaving()}
                    className="admin-settings-save-notifications"
                  >
                    {notificationsSaving() ? 'Saving...' : 'Save preferences'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ToastProvider position="bottom-right">
        <Toast variant="success" open={toastOpen()}>
          <div className="flex-1">
            <ToastTitle>Success</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
