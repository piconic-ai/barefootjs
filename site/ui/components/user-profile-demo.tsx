"use client"
/**
 * UserProfileDemo
 *
 * Developer profile page with inline editing, tabs, filterable repo list,
 * and activity feed.
 *
 * Compiler stress targets:
 * - Deep conditional nesting (3 levels: editing → verified → basic)
 * - Tabs with complex content switching (3 different subtrees)
 * - Inline editing with save/cancel (shared editingField signal)
 * - Per-item array mutation (star/unstar repos)
 * - Filter + sort memo chain (search + language + sort)
 * - Mixed loop types (component loop + plain element loop)
 * - 5-way conditional in loop (activity type badges)
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@ui/components/ui/card'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import { Textarea } from '@ui/components/ui/textarea'
import { Separator } from '@ui/components/ui/separator'
import { Avatar, AvatarFallback } from '@ui/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@ui/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'

// --- Types ---

type Skill = { name: string; level: 'beginner' | 'intermediate' | 'advanced' | 'expert' }

type Repository = {
  id: number
  name: string
  description: string
  language: string
  stars: number
  forks: number
  updated: string
  pinned: boolean
  starred: boolean
}

type ActivityType = 'commit' | 'pr' | 'issue' | 'review' | 'release'

type Activity = {
  id: number
  type: ActivityType
  repo: string
  message: string
  relativeTime: string
}

type UserProfile = {
  username: string
  displayName: string
  bio: string
  company: string
  location: string
  website: string
  verified: boolean
  joinDate: string
  about: string
  repos: Repository[]
  skills: Skill[]
  activities: Activity[]
  followers: number
  following: number
}

// --- Mock Data ---

const activityBadgeVariant = {
  commit: 'default',
  pr: 'secondary',
  issue: 'outline',
  review: 'secondary',
  release: 'default',
} as const

const activityLabels: Record<ActivityType, string> = {
  commit: 'Commit',
  pr: 'PR',
  issue: 'Issue',
  review: 'Review',
  release: 'Release',
}

const skillBadgeVariant = {
  expert: 'default',
  advanced: 'secondary',
  intermediate: 'outline',
  beginner: 'outline',
} as const

const initialProfile: UserProfile = {
  username: 'alexdev',
  displayName: 'Alex Chen',
  bio: 'Full-stack developer passionate about reactive frameworks and compiler design.',
  company: 'Acme Corp',
  location: 'San Francisco, CA',
  website: 'https://alexdev.io',
  verified: true,
  joinDate: 'Joined March 2020',
  about: 'I build tools that make developers more productive. Currently focused on signal-based reactivity patterns and JSX compilation. Previously worked on distributed systems at scale.',
  followers: 1240,
  following: 89,
  repos: [
    { id: 1, name: 'signal-compiler', description: 'JSX to reactive template compiler', language: 'TypeScript', stars: 342, forks: 45, updated: '2 days ago', pinned: true, starred: false },
    { id: 2, name: 'go-microservices', description: 'Production-ready microservice toolkit', language: 'Go', stars: 891, forks: 120, updated: '1 week ago', pinned: true, starred: true },
    { id: 3, name: 'rust-wasm-runtime', description: 'WebAssembly runtime for edge computing', language: 'Rust', stars: 567, forks: 78, updated: '3 days ago', pinned: true, starred: false },
    { id: 4, name: 'py-ml-pipeline', description: 'End-to-end ML pipeline framework', language: 'Python', stars: 234, forks: 56, updated: '2 weeks ago', pinned: false, starred: false },
    { id: 5, name: 'ts-form-validator', description: 'Type-safe form validation library', language: 'TypeScript', stars: 156, forks: 23, updated: '5 days ago', pinned: true, starred: true },
    { id: 6, name: 'go-cache', description: 'High-performance distributed cache', language: 'Go', stars: 423, forks: 67, updated: '1 month ago', pinned: false, starred: false },
    { id: 7, name: 'js-bundler', description: 'Zero-config JavaScript bundler', language: 'JavaScript', stars: 78, forks: 12, updated: '3 weeks ago', pinned: false, starred: false },
    { id: 8, name: 'rust-db', description: 'Embedded database engine', language: 'Rust', stars: 312, forks: 41, updated: '4 days ago', pinned: false, starred: true },
  ],
  skills: [
    { name: 'TypeScript', level: 'expert' },
    { name: 'React', level: 'expert' },
    { name: 'Go', level: 'advanced' },
    { name: 'Rust', level: 'intermediate' },
    { name: 'Python', level: 'advanced' },
    { name: 'GraphQL', level: 'intermediate' },
  ],
  activities: [
    { id: 1, type: 'commit', repo: 'signal-compiler', message: 'Fix inner loop accessor wrapping for component props', relativeTime: '2 hours ago' },
    { id: 2, type: 'pr', repo: 'go-microservices', message: 'Add circuit breaker middleware', relativeTime: '5 hours ago' },
    { id: 3, type: 'issue', repo: 'rust-wasm-runtime', message: 'Memory leak in long-running WASI processes', relativeTime: '1 day ago' },
    { id: 4, type: 'review', repo: 'ts-form-validator', message: 'Reviewed: Add async validation support', relativeTime: '1 day ago' },
    { id: 5, type: 'release', repo: 'go-cache', message: 'v2.1.0 — Redis protocol compatibility', relativeTime: '2 days ago' },
    { id: 6, type: 'commit', repo: 'signal-compiler', message: 'Move loop param wrapping into IR-aware template generation', relativeTime: '3 days ago' },
    { id: 7, type: 'pr', repo: 'rust-db', message: 'Implement WAL for crash recovery', relativeTime: '4 days ago' },
    { id: 8, type: 'issue', repo: 'py-ml-pipeline', message: 'Support custom preprocessing steps', relativeTime: '5 days ago' },
  ],
}

// --- Component ---

export function UserProfileDemo() {
  const [profile, setProfile] = createSignal<UserProfile>(initialProfile)
  const [activeTab, setActiveTab] = createSignal('overview')
  const [editingField, setEditingField] = createSignal<string | null>(null)
  const [repoFilter, setRepoFilter] = createSignal('all')
  const [repoSort, setRepoSort] = createSignal('stars')
  const [repoSearch, setRepoSearch] = createSignal('')

  // Tab memos
  const isOverviewTab = createMemo(() => activeTab() === 'overview')
  const isReposTab = createMemo(() => activeTab() === 'repos')
  const isActivityTab = createMemo(() => activeTab() === 'activity')

  // Stats derived from profile
  const totalStars = createMemo(() => profile().repos.reduce((s, r) => s + r.stars, 0))
  const repoCount = createMemo(() => profile().repos.length)
  const pinnedRepos = createMemo(() => profile().repos.filter(r => r.pinned))

  // Repo filter chain
  const languages = createMemo(() => [...new Set(profile().repos.map(r => r.language))])
  const filteredRepos = createMemo(() => {
    let repos = profile().repos
    if (repoFilter() !== 'all') repos = repos.filter(r => r.language === repoFilter())
    const q = repoSearch().toLowerCase()
    if (q) repos = repos.filter(r => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
    return repos
  })
  const sortedRepos = createMemo(() => {
    const items = [...filteredRepos()]
    const key = repoSort()
    if (key === 'stars') return items.sort((a, b) => b.stars - a.stars)
    if (key === 'name') return items.sort((a, b) => a.name.localeCompare(b.name))
    return items
  })

  // Handlers
  const cancelEdit = () => setEditingField(null)

  const saveName = (inputEl: HTMLInputElement) => {
    const value = inputEl.value.trim()
    if (value) setProfile(prev => ({ ...prev, displayName: value }))
    setEditingField(null)
  }

  const saveBio = (textareaEl: HTMLTextAreaElement) => {
    setProfile(prev => ({ ...prev, bio: textareaEl.value }))
    setEditingField(null)
  }

  const saveAbout = (textareaEl: HTMLTextAreaElement) => {
    setProfile(prev => ({ ...prev, about: textareaEl.value }))
    setEditingField(null)
  }

  const toggleStar = (repoId: number) => {
    setProfile(prev => ({
      ...prev,
      repos: prev.repos.map(r =>
        r.id === repoId
          ? { ...r, starred: !r.starred, stars: r.starred ? r.stars - 1 : r.stars + 1 }
          : r
      ),
    }))
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setEditingField(null)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* ===== PROFILE HEADER ===== */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-6">
            <Avatar className="size-20">
              <AvatarFallback className="text-2xl">AC</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-2">

              {/* Deep conditional nesting (3 levels): editing → verified → basic */}
              {editingField() === 'name' ? (
                <div className="profile-name-edit flex items-center gap-2">
                  <Input
                    value={profile().displayName}
                    className="profile-name-input max-w-xs"
                  />
                  <Button size="sm" onClick={(e: MouseEvent) => {
                    const input = (e.target as HTMLElement).closest('.profile-name-edit')?.querySelector('input') as HTMLInputElement | null
                    if (input) saveName(input)
                  }}>Save</Button>
                  <Button variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                </div>
              ) : profile().verified ? (
                <div className="flex items-center gap-2">
                  <h2 className="profile-name text-2xl font-bold">{profile().displayName}</h2>
                  <Badge variant="default" className="verified-badge">Verified</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setEditingField('name')}>Edit</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="profile-name text-2xl font-bold">{profile().displayName}</h2>
                  <Button variant="ghost" size="sm" onClick={() => setEditingField('name')}>Edit</Button>
                </div>
              )}

              {/* Inline edit: bio */}
              {editingField() === 'bio' ? (
                <div className="profile-bio-edit space-y-2">
                  <Textarea value={profile().bio} className="profile-bio-input text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={(e: MouseEvent) => {
                      const ta = (e.target as HTMLElement).closest('.profile-bio-edit')?.querySelector('textarea') as HTMLTextAreaElement | null
                      if (ta) saveBio(ta)
                    }}>Save</Button>
                    <Button variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="profile-bio text-sm text-muted-foreground">{profile().bio}</p>
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setEditingField('bio')}>Edit</Button>
                </div>
              )}

              {/* Mixed static + dynamic: meta info */}
              <div className="profile-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>@{profile().username}</span>
                <Separator orientation="vertical" decorative className="h-4" />
                <span>{profile().location}</span>
                <Separator orientation="vertical" decorative className="h-4" />
                <span>{profile().company}</span>
                <Separator orientation="vertical" decorative className="h-4" />
                <span>{profile().joinDate}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== STATS BAR ===== */}
      <div className="stats-bar grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="stat-repos text-2xl font-bold">{repoCount()}</div>
            <div className="text-xs text-muted-foreground">Repositories</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="stat-stars text-2xl font-bold">{totalStars()}</div>
            <div className="text-xs text-muted-foreground">Stars</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold">{profile().followers}</div>
            <div className="text-xs text-muted-foreground">Followers</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold">{profile().following}</div>
            <div className="text-xs text-muted-foreground">Following</div>
          </CardContent>
        </Card>
      </div>

      {/* ===== TABS ===== */}
      <Tabs value={activeTab()} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview" selected={isOverviewTab()} onClick={() => handleTabChange('overview')}>Overview</TabsTrigger>
          <TabsTrigger value="repos" selected={isReposTab()} onClick={() => handleTabChange('repos')}>Repositories</TabsTrigger>
          <TabsTrigger value="activity" selected={isActivityTab()} onClick={() => handleTabChange('activity')}>Activity</TabsTrigger>
        </TabsList>

        {/* --- OVERVIEW TAB --- */}
        <TabsContent value="overview" selected={isOverviewTab()}>
          <div className="space-y-6">
            {/* Pinned repos grid — component loop */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Pinned Repositories</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pinnedRepos().map(repo => (
                  <Card key={repo.id} className="pinned-repo">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">{repo.name}</CardTitle>
                      <CardDescription className="text-xs">{repo.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center gap-3 text-xs text-muted-foreground">
                      {repo.language ? (
                        <Badge variant="outline" className="text-xs">{repo.language}</Badge>
                      ) : null}
                      <span>{repo.stars} stars</span>
                      <span>{repo.forks} forks</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Skills — plain element loop with conditional Badge variants */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {profile().skills.map(skill => (
                  <Badge key={skill.name} variant={skillBadgeVariant[skill.level]} className="skill-tag">{skill.name}</Badge>
                ))}
              </div>
            </div>

            {/* About — inline edit */}
            <div>
              <h3 className="text-lg font-semibold mb-3">About</h3>
              {editingField() === 'about' ? (
                <div className="profile-about-edit space-y-2">
                  <Textarea value={profile().about} className="profile-about-input text-sm min-h-[100px]" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={(e: MouseEvent) => {
                      const ta = (e.target as HTMLElement).closest('.profile-about-edit')?.querySelector('textarea') as HTMLTextAreaElement | null
                      if (ta) saveAbout(ta)
                    }}>Save</Button>
                    <Button variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="profile-about text-sm text-muted-foreground leading-relaxed">{profile().about}</p>
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setEditingField('about')}>Edit</Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* --- REPOSITORIES TAB --- */}
        <TabsContent value="repos" selected={isReposTab()}>
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={repoSearch()}
                onInput={(e) => setRepoSearch(e.target.value)}
                placeholder="Find a repository..."
                className="repo-search flex-1"
              />
              <Select value={repoFilter()} onValueChange={setRepoFilter}>
                <SelectTrigger className="repo-language-filter w-[160px]">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Languages</SelectItem>
                  {languages().map(lang => (
                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={repoSort()} onValueChange={setRepoSort}>
                <SelectTrigger className="repo-sort w-[140px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stars">Stars</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results count */}
            <p className="repo-count text-sm text-muted-foreground">{filteredRepos().length} repositories</p>

            {/* Repo list */}
            <div className="space-y-1">
              {sortedRepos().map(repo => (
                <div key={repo.id} className="repo-item py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="repo-name text-sm font-semibold text-primary">{repo.name}</h4>
                      <p className="repo-desc text-xs text-muted-foreground mt-1">{repo.description}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {repo.language ? (
                          <Badge variant="outline" className="repo-language text-xs">{repo.language}</Badge>
                        ) : null}
                        <span className="repo-stars">{repo.stars} stars</span>
                        <span>{repo.forks} forks</span>
                        <span>Updated {repo.updated}</span>
                      </div>
                    </div>
                    <Button
                      variant={repo.starred ? 'default' : 'outline'}
                      size="sm"
                      className="star-button shrink-0"
                      onClick={() => toggleStar(repo.id)}
                    >
                      {repo.starred ? 'Unstar' : 'Star'}
                    </Button>
                  </div>
                  <Separator className="mt-4" />
                </div>
              ))}
            </div>

            {/* Empty state */}
            {sortedRepos().length === 0 ? (
              <div className="repo-empty text-center py-8 text-sm text-muted-foreground">
                No repositories match your filters.
              </div>
            ) : null}
          </div>
        </TabsContent>

        {/* --- ACTIVITY TAB --- */}
        <TabsContent value="activity" selected={isActivityTab()}>
          <div className="space-y-1">
            {profile().activities.map(activity => (
              <div key={activity.id} className="activity-item flex items-start gap-3 py-3">
                <Badge variant={activityBadgeVariant[activity.type]} className="activity-badge shrink-0 mt-0.5">
                  {activityLabels[activity.type]}
                </Badge>
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{activity.repo}</span>
                    <span className="text-muted-foreground"> — {activity.message}</span>
                  </p>
                  <span className="activity-time text-xs text-muted-foreground">{activity.relativeTime}</span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
