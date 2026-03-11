use tauri_plugin_sql::{Migration, MigrationKind};

pub fn run_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: r#"
                CREATE TABLE IF NOT EXISTS projects (
                    id          TEXT PRIMARY KEY,
                    name        TEXT NOT NULL,
                    path        TEXT NOT NULL,
                    status      TEXT NOT NULL DEFAULT 'created',
                    model_path  TEXT,
                    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS training_jobs (
                    id           TEXT PRIMARY KEY,
                    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    params       TEXT NOT NULL,
                    status       TEXT NOT NULL DEFAULT 'pending',
                    final_loss   REAL,
                    duration_s   INTEGER,
                    started_at   TEXT,
                    completed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS models (
                    id          TEXT PRIMARY KEY,
                    name        TEXT NOT NULL,
                    path        TEXT NOT NULL,
                    source      TEXT,
                    repo_id     TEXT,
                    size_bytes  INTEGER,
                    params_b    REAL,
                    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS parameter_presets (
                    id         TEXT PRIMARY KEY,
                    name       TEXT NOT NULL,
                    params     TEXT NOT NULL,
                    is_builtin INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS app_settings (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create notification history table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS notification_history (
                    id               TEXT PRIMARY KEY,
                    event_key        TEXT NOT NULL,
                    title            TEXT NOT NULL,
                    body             TEXT NOT NULL,
                    native_delivered INTEGER NOT NULL DEFAULT 0,
                    sound            TEXT,
                    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
                    read_at          TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_notification_history_created_at
                    ON notification_history(created_at DESC);
            "#,
            kind: MigrationKind::Up,
        },
    ]
}
