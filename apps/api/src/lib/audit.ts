import { db } from '../db/client';
import { auditLogs } from '../db/schema';

interface AuditParams {
  clinicId?: string;
  actorId?: string;
  actorType: 'admin' | 'doctor' | 'receptionist' | 'patient' | 'system';
  action: string;
  resourceType?: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
}

export async function auditLog(params: AuditParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      clinicId: params.clinicId,
      actorId: params.actorId,
      actorType: params.actorType,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      before: params.before as any,
      after: params.after as any,
      ipAddress: params.ipAddress as any,
    });
  } catch {
    // Audit log failures must never break the main flow
    console.error('[Audit] Failed to write audit log for action:', params.action);
  }
}
