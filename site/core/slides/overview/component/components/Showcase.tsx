'use client'
import { createSignal } from '@barefootjs/client'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../../../../ui/components/ui/card'
import { Button } from '../../../../../../ui/components/ui/button'
import { Input } from '../../../../../../ui/components/ui/input'
import { Label } from '../../../../../../ui/components/ui/label'
import { Checkbox } from '../../../../../../ui/components/ui/checkbox'
import { Switch } from '../../../../../../ui/components/ui/switch'
import { Avatar, AvatarFallback } from '../../../../../../ui/components/ui/avatar'
import { Badge } from '../../../../../../ui/components/ui/badge'
import { Separator } from '../../../../../../ui/components/ui/separator'

type Message = { id: number; from: 'me' | 'them'; name: string; time: string; text: string }

let nextMessageId = 4

export function Showcase() {
  const [rememberMe, setRememberMe] = createSignal(true)
  const [emailAlerts, setEmailAlerts] = createSignal(true)
  const [pushNotifications, setPushNotifications] = createSignal(false)
  const [weeklyDigest, setWeeklyDigest] = createSignal(true)
  const [messages, setMessages] = createSignal<Message[]>([
    { id: 1, from: 'them', name: 'Alex Smith', time: '10:42 AM', text: "Hey! How's the project going?" },
    { id: 2, from: 'me', name: 'You', time: '10:44 AM', text: 'Going great! Just finished the UI components.' },
    { id: 3, from: 'them', name: 'Alex Smith', time: '10:45 AM', text: 'Awesome!' },
  ])
  const [draft, setDraft] = createSignal('')

  const send = () => {
    const text = draft().trim()
    if (!text) return
    setMessages([...messages(), { id: nextMessageId++, from: 'me', name: 'You', time: 'now', text }])
    setDraft('')
  }

  return (
    <div className="showcase">
      <div className="showcase-grid">
        <Card className="showcase-card">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent className="showcase-form">
            <div className="showcase-field">
              <Label for="showcase-email">Email</Label>
              <Input id="showcase-email" type="email" placeholder="you@example.com" />
            </div>
            <div className="showcase-field">
              <Label for="showcase-password">Password</Label>
              <Input id="showcase-password" type="password" placeholder="········" />
            </div>
            <label className="showcase-remember">
              <Checkbox checked={rememberMe()} onCheckedChange={setRememberMe} />
              <span>Remember me</span>
            </label>
          </CardContent>
          <CardFooter>
            <Button className="showcase-btn showcase-full">Sign In</Button>
          </CardFooter>
        </Card>

        <Card className="showcase-card showcase-profile">
          <CardContent className="showcase-profile-body">
            <Avatar className="showcase-avatar">
              <AvatarFallback className="showcase-avatar-fallback">JD</AvatarFallback>
            </Avatar>
            <p className="showcase-profile-name">Jane Doe</p>
            <p className="showcase-profile-role">Software Engineer</p>
            <Separator className="showcase-sep" />
            <div className="showcase-stats">
              <div className="showcase-stat">
                <span className="showcase-stat-value">128</span>
                <span className="showcase-stat-label">Posts</span>
              </div>
              <div className="showcase-stat">
                <span className="showcase-stat-value">2.4k</span>
                <span className="showcase-stat-label">Followers</span>
              </div>
              <div className="showcase-stat">
                <span className="showcase-stat-value">847</span>
                <span className="showcase-stat-label">Following</span>
              </div>
            </div>
            <Separator className="showcase-sep" />
            <Button variant="outline" className="showcase-btn showcase-full">View Profile</Button>
          </CardContent>
        </Card>

        <Card className="showcase-card">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Manage your preferences</CardDescription>
          </CardHeader>
          <CardContent className="showcase-notif-list">
            <div className="showcase-notif-row">
              <div className="showcase-notif-text">
                <p className="showcase-notif-label">Email alerts</p>
                <p className="showcase-notif-sub">Receive email notifications</p>
              </div>
              <Switch checked={emailAlerts()} onCheckedChange={setEmailAlerts} />
            </div>
            <Separator />
            <div className="showcase-notif-row">
              <div className="showcase-notif-text">
                <p className="showcase-notif-label">Push notifications</p>
                <p className="showcase-notif-sub">Receive push alerts</p>
              </div>
              <Switch checked={pushNotifications()} onCheckedChange={setPushNotifications} />
            </div>
            <Separator />
            <div className="showcase-notif-row">
              <div className="showcase-notif-text">
                <p className="showcase-notif-label">Weekly digest</p>
                <p className="showcase-notif-sub">Summary of activity</p>
              </div>
              <Switch checked={weeklyDigest()} onCheckedChange={setWeeklyDigest} />
            </div>
          </CardContent>
        </Card>

        <Card className="showcase-card showcase-pro">
          <CardHeader>
            <div className="showcase-pro-head">
              <CardTitle>Pro Plan</CardTitle>
              <Badge className="showcase-pro-badge">Popular</Badge>
            </div>
          </CardHeader>
          <CardContent className="showcase-pro-body">
            <p className="showcase-price">
              <span className="showcase-price-amount">$29</span>
              <span className="showcase-price-period">/month</span>
            </p>
            <ul className="showcase-features">
              <li>Unlimited projects</li>
              <li>Priority support</li>
              <li>Advanced analytics</li>
              <li>Custom integrations</li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="showcase-btn showcase-full">Get Started</Button>
          </CardFooter>
        </Card>

        <Card className="showcase-card showcase-messages">
          <CardHeader>
            <CardTitle>Messages</CardTitle>
          </CardHeader>
          <CardContent className="showcase-chat">
            {messages().map(m => (
              <div key={m.id} className={m.from === 'me' ? 'showcase-msg showcase-msg-me' : 'showcase-msg showcase-msg-them'}>
                <Avatar className={m.from === 'me' ? 'showcase-msg-avatar showcase-msg-avatar-me' : 'showcase-msg-avatar'}>
                  <AvatarFallback className={m.from === 'me' ? 'showcase-msg-avatar-fallback showcase-msg-avatar-fallback-me' : 'showcase-msg-avatar-fallback'}>
                    {m.from === 'me' ? 'JD' : 'AS'}
                  </AvatarFallback>
                </Avatar>
                <div className="showcase-msg-col">
                  <p className="showcase-msg-meta">{m.name} · {m.time}</p>
                  <p className={m.from === 'me' ? 'showcase-msg-bubble showcase-msg-bubble-me' : 'showcase-msg-bubble'}>{m.text}</p>
                </div>
              </div>
            ))}
          </CardContent>
          <CardFooter className="showcase-chat-footer">
            <Input
              className="showcase-chat-input"
              placeholder="Type a message..."
              value={draft()}
              onInput={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
            />
            <Button className="showcase-btn" onClick={send}>Send</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
