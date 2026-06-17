// lib/utils/permissions.ts
// Single source of truth for all role permission checks
// Used in both client components and server actions

import type { Role } from '@/lib/types'

const ROLE_RANK: Record<Role, number> = {
  r1: 1, r2: 2, r3: 3, r4: 4, r5: 5, supreme: 6,
}

export function hasRole(userRole: Role, required: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[required]
}

export const can = {
  // ── Supreme only ──────────────────────────
  createAlliance:       (r: Role) => r === 'supreme',
  disableCommander:     (r: Role) => r === 'supreme',
  enableCommander:      (r: Role) => r === 'supreme',
  resetGoogleAccount:   (r: Role) => r === 'supreme',
  viewGlobalAnalytics:  (r: Role) => r === 'supreme',
  toggleDSBGlobal:      (r: Role) => r === 'supreme',
  toggleCanyonGlobal:   (r: Role) => r === 'supreme',
  addCommanderToSystem: (r: Role) => r === 'supreme',

  // ── R4 and above ──────────────────────────
  manageDSB:          (r: Role) => hasRole(r, 'r4'),
  manageCanyon:       (r: Role) => hasRole(r, 'r4'),
  manageAttendance:   (r: Role) => hasRole(r, 'r4'),
  manageDuel:         (r: Role) => hasRole(r, 'r4'),
  approveTransfers:   (r: Role) => hasRole(r, 'r4'),
  rejectTransfers:    (r: Role) => hasRole(r, 'r4'),
  assignRoles:        (r: Role) => hasRole(r, 'r4'),
  removeMembers:      (r: Role) => hasRole(r, 'r4'),
  markInactive:       (r: Role) => hasRole(r, 'r4'),
  editRemarks:        (r: Role) => hasRole(r, 'r4'),

  // ── R5 and above ──────────────────────────
  removeR4:                  (r: Role) => hasRole(r, 'r5'),
  manageAllianceSettings:    (r: Role) => hasRole(r, 'r5'),

  // ── All members ───────────────────────────
  viewAuditLog:      (r: Role) => hasRole(r, 'r1'),
  viewMembers:       (r: Role) => hasRole(r, 'r1'),
  viewDashboard:     (r: Role) => hasRole(r, 'r1'),
  requestTransfer:   (r: Role) => hasRole(r, 'r1'),

  // ── Role removal logic ────────────────────
  canRemove: (actor: Role, target: Role): boolean => {
    if (actor === 'supreme') return target !== 'supreme'
    if (actor === 'r5')      return ROLE_RANK[target] < ROLE_RANK['r5']
    if (actor === 'r4')      return ROLE_RANK[target] < ROLE_RANK['r4']
    return false
  },

  // ── Helper ────────────────────────────────
  hasRole,
}