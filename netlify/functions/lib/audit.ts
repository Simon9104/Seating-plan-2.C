import type { Client } from '@libsql/client';

export async function logAction(
  db: Client,
  adminUsername: string,
  action: string,
  details: string | null,
  ip: string
): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO audit_log (admin_username, action, details, ip) VALUES (?, ?, ?, ?)',
    args: [adminUsername, action, details, ip]
  });
}

export interface AuditEntry {
  id: number;
  adminUsername: string;
  action: string;
  details: string | null;
  createdAt: string;
}

export async function listAuditLog(db: Client, limit: number, offset: number): Promise<AuditEntry[]> {
  const res = await db.execute({
    sql: `SELECT id, admin_username, action, details, created_at FROM audit_log
          ORDER BY id DESC LIMIT ? OFFSET ?`,
    args: [limit, offset]
  });
  return res.rows.map((r) => {
    const row = r as unknown as {
      id: number;
      admin_username: string;
      action: string;
      details: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      adminUsername: row.admin_username,
      action: row.action,
      details: row.details,
      createdAt: row.created_at
    };
  });
}
