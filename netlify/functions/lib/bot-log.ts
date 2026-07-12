import type { Client } from '@libsql/client';
import type { BotLogCountrySummary, BotLogEntry } from '../../../shared/types';

interface BotLogRow {
  id: number;
  path: string;
  method: string;
  ip: string | null;
  country_code: string | null;
  country_name: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  user_agent: string | null;
  username: string | null;
  password: string | null;
  created_at: string;
}

function toEntry(row: BotLogRow): BotLogEntry {
  return {
    id: row.id,
    path: row.path,
    method: row.method,
    ip: row.ip,
    countryCode: row.country_code,
    countryName: row.country_name,
    region: row.region,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    userAgent: row.user_agent,
    username: row.username,
    password: row.password,
    createdAt: row.created_at
  };
}

export async function listBotLog(db: Client, limit: number, offset: number, country?: string): Promise<BotLogEntry[]> {
  const res = country
    ? await db.execute({
        sql: `SELECT * FROM bot_log WHERE country_code = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
        args: [country, limit, offset]
      })
    : await db.execute({
        sql: `SELECT * FROM bot_log ORDER BY id DESC LIMIT ? OFFSET ?`,
        args: [limit, offset]
      });
  return res.rows.map((r) => toEntry(r as unknown as BotLogRow));
}

export async function botLogCountrySummary(db: Client): Promise<BotLogCountrySummary[]> {
  const res = await db.execute(
    `SELECT country_code, country_name, COUNT(*) as count FROM bot_log
     GROUP BY country_code ORDER BY count DESC LIMIT 100`
  );
  return res.rows.map((r) => {
    const row = r as unknown as { country_code: string | null; country_name: string | null; count: number };
    return { countryCode: row.country_code, countryName: row.country_name, count: Number(row.count) };
  });
}

export async function botLogTotalCount(db: Client): Promise<number> {
  const res = await db.execute('SELECT COUNT(*) as c FROM bot_log');
  return Number((res.rows[0] as unknown as { c: number }).c);
}
