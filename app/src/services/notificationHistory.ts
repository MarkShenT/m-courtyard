import { getDb } from "@/services/db";

export interface NotificationHistoryItem {
  id: string;
  event_key: string;
  title: string;
  body: string;
  native_delivered: boolean;
  sound: string | null;
  created_at: string;
  read_at: string | null;
}

interface NotificationHistoryRow {
  id: string;
  event_key: string;
  title: string;
  body: string;
  native_delivered: number;
  sound: string | null;
  created_at: string;
  read_at: string | null;
}

function normalizeRow(row: NotificationHistoryRow): NotificationHistoryItem {
  return {
    ...row,
    native_delivered: row.native_delivered === 1,
  };
}

export async function listNotificationHistory(limit = 50): Promise<NotificationHistoryItem[]> {
  const db = await getDb();
  const rows = await db.select<NotificationHistoryRow[]>(
    `SELECT id, event_key, title, body, native_delivered, sound, created_at, read_at
     FROM notification_history
     ORDER BY datetime(created_at) DESC, id DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(normalizeRow);
}

export async function addNotificationHistory(input: {
  id: string;
  event_key: string;
  title: string;
  body: string;
  native_delivered: boolean;
  sound?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO notification_history
      (id, event_key, title, body, native_delivered, sound)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.id,
      input.event_key,
      input.title,
      input.body,
      input.native_delivered ? 1 : 0,
      input.sound ?? null,
    ]
  );
}

export async function markNotificationHistoryRead(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE notification_history
     SET read_at = COALESCE(read_at, datetime('now'))
     WHERE id = $1`,
    [id]
  );
}

export async function markAllNotificationHistoryRead(): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE notification_history
     SET read_at = datetime('now')
     WHERE read_at IS NULL`
  );
}

export async function clearNotificationHistory(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notification_history");
}
