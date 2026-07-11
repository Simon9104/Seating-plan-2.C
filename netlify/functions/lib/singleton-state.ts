import type { Client } from '@libsql/client';

// Every table here is a single-row (id=1) JSON blob with optimistic
// concurrency via `version`. Table names are only ever passed as literal
// constants from our own code (never user input), so string-building the
// SQL is safe — libSQL bind params can't parametrize identifiers anyway.
export type SingletonTable = 'seating_state' | 'timetable_state' | 'room_timetable_state';

const MAX_RETRIES = 5;

export async function loadSingletonState<T>(
  db: Client,
  table: SingletonTable,
  defaultFactory: () => T
): Promise<{ state: T; version: number }> {
  const res = await db.execute(`SELECT data, version FROM ${table} WHERE id = 1`);
  const row = res.rows[0] as unknown as { data: string; version: number } | undefined;
  if (!row) {
    const fresh = defaultFactory();
    await db.execute({
      sql: `INSERT INTO ${table} (id, data, version) VALUES (1, ?, 0)`,
      args: [JSON.stringify(fresh)]
    });
    return { state: fresh, version: 0 };
  }
  return { state: JSON.parse(row.data) as T, version: row.version };
}

export async function updateSingletonState<T>(
  db: Client,
  table: SingletonTable,
  adminUsername: string,
  defaultFactory: () => T,
  mutator: (state: T) => T
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { state, version } = await loadSingletonState(db, table, defaultFactory);
    const next = mutator(state);
    const res = await db.execute({
      sql: `UPDATE ${table} SET data = ?, version = version + 1, updated_at = datetime('now'), updated_by = ?
            WHERE id = 1 AND version = ?`,
      args: [JSON.stringify(next), adminUsername, version]
    });
    if (Number(res.rowsAffected) > 0) return next;
  }
  throw new Error(`Could not save ${table} after several attempts (concurrent updates) — try again.`);
}
