"use client"
/**
 * PermissionMatrixDemo
 *
 * Role x Permission grid with inheritance cascade, diamond memo dependencies,
 * and bulk operations.
 *
 * Compiler stress targets:
 * - Diamond memo dependency: directGrants → effectivePerms → cellStates + roleStats
 *   (multiple memos reading from shared signals, forming a diamond DAG)
 * - 2D nested loop: ALL_PERMISSIONS.map(perm => ROLES.map(role => <Checkbox>))
 * - Per-cell derived state: each cell's checked/disabled/inherited from memo chain
 * - Bulk toggle: column/row bulk ops triggering cascading memo updates
 * - Reactive text in loop: per-role count badges update reactively
 * - Static array with preceding siblings (tests getLoopChildren offset)
 * - Nested static array component initialization (inner loop Checkbox)
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { Badge } from '@ui/components/ui/badge'
import { Checkbox } from '@ui/components/ui/checkbox'

// --- Types ---

type Permission = { id: string; label: string; category: string }
type Role = { id: string; label: string; rank: number }
type CellState = { checked: boolean; inherited: boolean; disabled: boolean }

// --- Data ---

const ROLES: Role[] = [
  { id: 'viewer', label: 'Viewer', rank: 4 },
  { id: 'editor', label: 'Editor', rank: 3 },
  { id: 'admin', label: 'Admin', rank: 2 },
  { id: 'owner', label: 'Owner', rank: 1 },
]

const ALL_PERMISSIONS: Permission[] = [
  { id: 'content:create', label: 'Create', category: 'Content' },
  { id: 'content:read', label: 'Read', category: 'Content' },
  { id: 'content:update', label: 'Update', category: 'Content' },
  { id: 'content:delete', label: 'Delete', category: 'Content' },
  { id: 'users:invite', label: 'Invite', category: 'Users' },
  { id: 'users:manage', label: 'Manage', category: 'Users' },
  { id: 'users:remove', label: 'Remove', category: 'Users' },
  { id: 'settings:billing', label: 'Billing', category: 'Settings' },
  { id: 'settings:integrations', label: 'Integrations', category: 'Settings' },
  { id: 'settings:security', label: 'Security', category: 'Settings' },
  { id: 'reports:view', label: 'View', category: 'Reports' },
  { id: 'reports:export', label: 'Export', category: 'Reports' },
]

// Initial direct grants per role
function buildInitialGrants(): Record<string, string[]> {
  return {
    viewer: ['content:read', 'reports:view'],
    editor: ['content:create', 'content:update', 'reports:export'],
    admin: ['content:delete', 'users:invite', 'users:manage', 'settings:integrations'],
    owner: ['users:remove', 'settings:billing', 'settings:security'],
  }
}

// --- Helpers ---

function hasDirectGrant(grants: Record<string, string[]>, roleId: string, permId: string): boolean {
  const roleGrants = grants[roleId]
  if (!roleGrants) return false
  return roleGrants.indexOf(permId) !== -1
}

// --- Component ---

export function PermissionMatrixDemo() {
  const [directGrants, setDirectGrants] = createSignal<Record<string, string[]>>(buildInitialGrants())

  // Diamond memo node 1: effective permissions per role (direct + inherited)
  const effectivePerms = createMemo(() => {
    const grants = directGrants()
    const result: Record<string, string[]> = {}
    for (const role of ROLES) {
      const effective = new Set<string>()
      for (const otherRole of ROLES) {
        if (otherRole.rank >= role.rank) {
          const otherGrants = grants[otherRole.id]
          if (otherGrants) {
            for (const permId of otherGrants) {
              effective.add(permId)
            }
          }
        }
      }
      result[role.id] = Array.from(effective)
    }
    return result
  })

  // Diamond memo node 2: per-cell state (reads both effectivePerms AND directGrants — diamond)
  const cellStates = createMemo(() => {
    const grants = directGrants()
    const effective = effectivePerms()
    const states: Record<string, CellState> = {}
    for (const role of ROLES) {
      const effectiveList = effective[role.id] || []
      for (const perm of ALL_PERMISSIONS) {
        const key = `${role.id}:${perm.id}`
        const isEffective = effectiveList.indexOf(perm.id) !== -1
        const isDirect = hasDirectGrant(grants, role.id, perm.id)
        states[key] = {
          checked: isEffective,
          inherited: isEffective && !isDirect,
          disabled: isEffective && !isDirect,
        }
      }
    }
    return states
  })

  // Diamond memo node 3: stats per role (reads effectivePerms + directGrants — converges)
  const roleStats = createMemo(() => {
    const effective = effectivePerms()
    const grants = directGrants()
    const stats: Record<string, { total: number; direct: number; inherited: number }> = {}
    for (const role of ROLES) {
      const effectiveList = effective[role.id] || []
      let directCount = 0
      let inheritedCount = 0
      for (const permId of effectiveList) {
        if (hasDirectGrant(grants, role.id, permId)) {
          directCount++
        } else {
          inheritedCount++
        }
      }
      stats[role.id] = {
        total: effectiveList.length,
        direct: directCount,
        inherited: inheritedCount,
      }
    }
    return stats
  })

  // Aggregate stats
  const totalDirectGrants = createMemo(() => {
    const stats = roleStats()
    let total = 0
    for (const role of ROLES) {
      total += stats[role.id].direct
    }
    return total
  })

  const totalInherited = createMemo(() => {
    const stats = roleStats()
    let total = 0
    for (const role of ROLES) {
      total += stats[role.id].inherited
    }
    return total
  })

  // --- Actions ---

  const togglePermission = (roleId: string, permId: string) => {
    const states = cellStates()
    const key = `${roleId}:${permId}`
    const cell = states[key]
    if (cell && cell.inherited) return

    setDirectGrants((prev: Record<string, string[]>) => {
      const roleGrants = prev[roleId] || []
      const has = roleGrants.indexOf(permId) !== -1
      const updated = has
        ? roleGrants.filter((p: string) => p !== permId)
        : [...roleGrants, permId]
      return { ...prev, [roleId]: updated }
    })
  }

  const grantAllForRole = (roleId: string) => {
    setDirectGrants((prev: Record<string, string[]>) => {
      const effective = effectivePerms()
      const alreadyEffective = effective[roleId] || []
      const newGrants: string[] = []
      for (const perm of ALL_PERMISSIONS) {
        if (alreadyEffective.indexOf(perm.id) === -1) {
          newGrants.push(perm.id)
        }
      }
      const existing = prev[roleId] || []
      return { ...prev, [roleId]: [...existing, ...newGrants] }
    })
  }

  const revokeAllForRole = (roleId: string) => {
    setDirectGrants((prev: Record<string, string[]>) => ({ ...prev, [roleId]: [] }))
  }

  const grantAllForPerm = (permId: string) => {
    setDirectGrants((prev: Record<string, string[]>) => {
      const updated = { ...prev }
      for (const role of ROLES) {
        const effective = effectivePerms()[role.id] || []
        if (effective.indexOf(permId) === -1) {
          updated[role.id] = [...(updated[role.id] || []), permId]
        }
      }
      return updated
    })
  }

  const revokeAllForPerm = (permId: string) => {
    setDirectGrants((prev: Record<string, string[]>) => {
      const updated = { ...prev }
      for (const role of ROLES) {
        updated[role.id] = (updated[role.id] || []).filter((p: string) => p !== permId)
      }
      return updated
    })
  }

  return (
    <div className="permission-matrix-page w-full max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Permission Matrix</h2>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span className="direct-count">Direct: {totalDirectGrants()}</span>
          <span className="inherited-count">Inherited: {totalInherited()}</span>
        </div>
      </div>

      {/* Role stats badges */}
      <div className="flex gap-2 flex-wrap">
        {ROLES.map(role => (
          <Badge key={role.id} variant="outline" className={`perm-count perm-count-${role.id}`}>
            {role.label}: {roleStats()[role.id].total}/{ALL_PERMISSIONS.length}
          </Badge>
        ))}
      </div>

      {/* Grid — 2D nested static array: ALL_PERMISSIONS.map → ROLES.map */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            {/* Static "Permission" th + ROLES.map: tests getLoopChildren with preceding sibling */}
            <tr className="bg-muted/50">
              <th className="text-left p-3 font-medium border-r min-w-[180px]">Permission</th>
              {ROLES.map(role => (
                <th key={role.id} className="role-header p-2 text-center font-medium border-r last:border-r-0 min-w-[100px]">
                  <div className="flex flex-col items-center gap-1">
                    <span>{role.label}</span>
                    <div className="flex gap-1">
                      <button
                        className={`role-toggle grant-all-btn grant-all-${role.id} text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent transition-colors`}
                        onClick={() => grantAllForRole(role.id)}
                      >
                        All
                      </button>
                      <button
                        className={`role-toggle revoke-all-btn revoke-all-${role.id} text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent transition-colors`}
                        onClick={() => revokeAllForRole(role.id)}
                      >
                        None
                      </button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map(perm => (
              <tr key={perm.id} className="perm-row border-b last:border-0 hover:bg-accent/30 transition-colors">
                <td className="p-2 pl-4 border-r">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="perm-label text-sm">{perm.label}</span>
                      <span className="perm-category ml-1.5 text-[10px] text-muted-foreground">{perm.category}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className={`grant-all-btn grant-perm-${perm.id.replace(':', '-')} text-[10px] px-1 py-0 rounded border border-border hover:bg-accent transition-colors text-muted-foreground`}
                        onClick={() => grantAllForPerm(perm.id)}
                      >
                        +
                      </button>
                      <button
                        className={`revoke-all-btn revoke-perm-${perm.id.replace(':', '-')} text-[10px] px-1 py-0 rounded border border-border hover:bg-accent transition-colors text-muted-foreground`}
                        onClick={() => revokeAllForPerm(perm.id)}
                      >
                        -
                      </button>
                    </div>
                  </div>
                </td>
                {/* Inner ROLES.map: tests nested static array component init */}
                {ROLES.map(role => (
                  <td key={role.id} className="perm-cell border-r last:border-r-0 text-center p-2">
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={cellStates()[`${role.id}:${perm.id}`].checked}
                        disabled={cellStates()[`${role.id}:${perm.id}`].disabled}
                        onCheckedChange={() => togglePermission(role.id, perm.id)}
                        className={cellStates()[`${role.id}:${perm.id}`].inherited ? 'inherited-badge opacity-50' : ''}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-[3px] border bg-primary" />
          Direct grant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-[3px] border bg-primary opacity-50" />
          Inherited (disabled)
        </span>
      </div>
    </div>
  )
}
