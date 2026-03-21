import db from '../config/database';

interface AuditEntry {
  userId?: string;
  username?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  previousValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  await db('audit_logs').insert({
    user_id: entry.userId,
    username: entry.username,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    details: entry.details ? JSON.stringify(entry.details) : null,
    previous_values: entry.previousValues ? JSON.stringify(entry.previousValues) : null,
    ip_address: entry.ipAddress,
    user_agent: entry.userAgent,
  });
}

export async function getAuditLogs(filters: {
  userId?: string;
  entityType?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const { page = 1, limit = 50 } = filters;
  const query = db('audit_logs')
    .leftJoin('users', 'audit_logs.user_id', 'users.id')
    .select(
      'audit_logs.*',
      'users.username as performer_username'
    )
    .orderBy('audit_logs.created_at', 'desc');

  if (filters.userId) query.where('audit_logs.user_id', filters.userId);
  if (filters.entityType) query.where('audit_logs.entity_type', filters.entityType);
  if (filters.action) query.where('audit_logs.action', filters.action);
  if (filters.startDate) query.where('audit_logs.created_at', '>=', filters.startDate);
  if (filters.endDate) query.where('audit_logs.created_at', '<=', filters.endDate);

  const countQuery = query.clone().clearSelect().clearOrder().count('* as total').first();
  const [{ total }] = await Promise.all([countQuery]).then(r => [r as any]);

  const rows = await query.offset((page - 1) * limit).limit(limit);

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    },
  };
}
