// src/app/actions/members/setInactive.ts
// ACC #7C — Example: how to fire FCM from an existing server action
// Pattern applies to ALL three triggers (inactive, transfer, event)

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getServerCommander } from '@/lib/firebase/serverAuth';
import { supabaseAdmin }       from '@/lib/supabase/admin';
import { hasPermission }       from '@/lib/utils/permissions';
import { writeAuditLog }       from '@/lib/utils/audit';
import { notifyInactiveFlag }  from '@/lib/fcm/sendNotification'; // ← new

const Schema = z.object({
  commanderId: z.string().uuid(),
  allianceId:  z.string().uuid(),
});

export async function setMemberInactive(formData: FormData) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const actor = await getServerCommander();
  if (!actor) return { error: 'Unauthorised' };
  if (!hasPermission(actor.role, 'manage_members')) return { error: 'Forbidden' };

  // ── Validate ────────────────────────────────────────────────────────────
  const parsed = Schema.safeParse({
    commanderId: formData.get('commanderId'),
    allianceId:  formData.get('allianceId'),
  });
  if (!parsed.success) return { error: 'Invalid input' };

  const { commanderId, allianceId } = parsed.data;

  // Prevent acting on self
  if (commanderId === actor.id) return { error: 'Cannot flag yourself as inactive' };

  // ── Fetch member ────────────────────────────────────────────────────────
  const { data: member, error: fetchErr } = await supabaseAdmin
    .from('commanders')
    .select('id, name, alliance_id, status')
    .eq('id', commanderId)
    .eq('alliance_id', allianceId)
    .single();

  if (fetchErr || !member) return { error: 'Commander not found' };
  if (member.status === 'inactive') return { error: 'Already inactive' };

  // ── Update status ───────────────────────────────────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('commanders')
    .update({ status: 'inactive', inactive_since: new Date().toISOString() })
    .eq('id', commanderId);

  if (updateErr) {
    console.error('[setInactive] DB error:', updateErr);
    return { error: 'Update failed' };
  }

  // ── Audit log ───────────────────────────────────────────────────────────
  await writeAuditLog({
    actorId:    actor.id,
    allianceId,
    action:     'member.inactive',
    targetId:   commanderId,
    targetName: member.name,
  });

  // ── FCM push — notify R4/R5 of this alliance ────────────────────────────
  // Fire-and-forget: notification failure must not fail the action
  notifyInactiveFlag({
    allianceId,
    memberName: member.name,
  }).catch((err) => console.error('[setInactive] FCM notify error:', err));

  revalidatePath(`/alliance/${allianceId}/members`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern for transfer request (add to your createTransfer server action):
//
//   import { notifyTransferRequest } from '@/lib/fcm/sendNotification';
//
//   // After successfully inserting the transfer row:
//   notifyTransferRequest({
//     commanderIds: [targetCommanderId, allianceR5Id],
//     requesterName: actor.name,
//     allianceId,
//     transferId: newTransfer.id,
//   }).catch(console.error);
//
// ─────────────────────────────────────────────────────────────────────────────
// Pattern for event state change (add to your updateEventState server action):
//
//   import { notifyEventUpdate } from '@/lib/fcm/sendNotification';
//
//   // After successfully updating the event:
//   notifyEventUpdate({
//     allianceId,
//     eventName: event.name,
//     newState: newState,
//     eventId: event.id,
//   }).catch(console.error);
//