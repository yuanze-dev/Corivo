interface SchemaRuntime {
  db: {
    prepare(sql: string): any;
    exec(sql: string): void;
    pragma(input: string, options?: { simple?: boolean }): unknown;
  };
}

export function ensureDatabaseSchema(runtime: SchemaRuntime): void {
  const tableExists = runtime.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='blocks'",
  ).get() as { name: string } | undefined;

  if (!tableExists) {
    runtime.db.exec(`
      CREATE TABLE blocks (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        annotation TEXT DEFAULT 'pending',
        refs TEXT DEFAULT '[]',
        source TEXT DEFAULT 'manual',
        vitality INTEGER DEFAULT 100,
        status TEXT DEFAULT 'active',
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER,
        pattern TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')))
    `);
  }

  const ftsTable = runtime.db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='blocks_fts'",
  ).get() as { sql: string } | undefined;

  if (ftsTable && ftsTable.sql.includes("content='blocks'")) {
    runtime.db.exec(`DROP TABLE IF EXISTS blocks_fts`);
    runtime.db.exec(`DROP TRIGGER IF EXISTS blocks_ai`);
    runtime.db.exec(`DROP TRIGGER IF EXISTS blocks_au`);
    runtime.db.exec(`DROP TRIGGER IF EXISTS blocks_ad`);
  }

  const ftsExists = runtime.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='blocks_fts'",
  ).get() as { name: string } | undefined;

  if (!ftsExists) {
    runtime.db.exec(`
      CREATE VIRTUAL TABLE blocks_fts USING fts5(
        id UNINDEXED,
        content,
        annotation
      )
    `);

    runtime.db.exec(`
      CREATE TRIGGER blocks_ai AFTER INSERT ON blocks BEGIN
        INSERT INTO blocks_fts(id, content, annotation)
        VALUES (new.id, new.content, new.annotation);
      END
    `);

    runtime.db.exec(`
      CREATE TRIGGER blocks_au AFTER UPDATE ON blocks BEGIN
        DELETE FROM blocks_fts WHERE id = old.id;
        INSERT INTO blocks_fts(id, content, annotation)
        VALUES (new.id, new.content, new.annotation);
      END
    `);

    runtime.db.exec(`
      CREATE TRIGGER blocks_ad AFTER DELETE ON blocks BEGIN
        DELETE FROM blocks_fts WHERE id = old.id;
      END
    `);

    runtime.db.exec(`
      INSERT INTO blocks_fts(id, content, annotation)
      SELECT id, content, annotation FROM blocks
    `);
  }

  runtime.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_blocks_annotation ON blocks(annotation);
    CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks(status);
    CREATE INDEX IF NOT EXISTS idx_blocks_vitality ON blocks(vitality);
    CREATE INDEX IF NOT EXISTS idx_blocks_updated ON blocks(updated_at);
    CREATE INDEX IF NOT EXISTS idx_blocks_created_at ON blocks(created_at);
  `);

  const assocTable = runtime.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='associations'",
  ).get() as { name: string } | undefined;

  if (!assocTable) {
    runtime.db.exec(`
      CREATE TABLE associations (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        type TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'one_way',
        confidence REAL NOT NULL,
        reason TEXT,
        context_tags TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        UNIQUE(from_id, to_id, type))
    `);

    runtime.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_associations_from ON associations(from_id);
      CREATE INDEX IF NOT EXISTS idx_associations_to ON associations(to_id);
      CREATE INDEX IF NOT EXISTS idx_associations_type ON associations(type);
      CREATE INDEX IF NOT EXISTS idx_associations_confidence ON associations(confidence);
    `);
  }

  const queryLogsTable = runtime.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='query_logs'",
  ).get() as { name: string } | undefined;

  if (!queryLogsTable) {
    runtime.db.exec(`
      CREATE TABLE query_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        query TEXT NOT NULL,
        result_count INTEGER DEFAULT 0)
    `);

    runtime.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_query_logs_timestamp ON query_logs(timestamp);
    `);
  }

  runtime.db.exec(`
    CREATE TABLE IF NOT EXISTS raw_sessions (
      id TEXT PRIMARY KEY,
      host TEXT NOT NULL,
      external_session_id TEXT NOT NULL,
      session_key TEXT NOT NULL,
      source_type TEXT NOT NULL,
      project_identity TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      last_message_at INTEGER,
      last_import_cursor TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(host, external_session_id),
      UNIQUE(session_key)
    );

    CREATE INDEX IF NOT EXISTS idx_raw_sessions_host ON raw_sessions(host);
    CREATE INDEX IF NOT EXISTS idx_raw_sessions_last_message_at ON raw_sessions(last_message_at);

    CREATE TABLE IF NOT EXISTS raw_messages (
      id TEXT PRIMARY KEY,
      session_key TEXT NOT NULL,
      external_message_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      created_at INTEGER,
      ingested_from TEXT NOT NULL,
      ingest_event_id TEXT,
      created_db_at INTEGER NOT NULL,
      updated_db_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_messages_external
    ON raw_messages(session_key, external_message_id)
    WHERE external_message_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_messages_ordinal_role
    ON raw_messages(session_key, ordinal, role)
    WHERE external_message_id IS NULL;

    CREATE INDEX IF NOT EXISTS idx_raw_messages_session_ordinal
    ON raw_messages(session_key, ordinal, created_at, created_db_at);

    CREATE TABLE IF NOT EXISTS memory_processing_jobs (
      id TEXT PRIMARY KEY,
      host TEXT NOT NULL,
      session_key TEXT NOT NULL,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      priority INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      available_at INTEGER NOT NULL,
      claimed_at INTEGER,
      finished_at INTEGER,
      last_error TEXT,
      payload_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_processing_jobs_status_available
    ON memory_processing_jobs(status, available_at, priority DESC, created_at);
    CREATE INDEX IF NOT EXISTS idx_memory_processing_jobs_session_key
    ON memory_processing_jobs(session_key);

    CREATE TABLE IF NOT EXISTS host_import_cursors (
      host TEXT PRIMARY KEY,
      last_import_cursor TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const sessionRecordsTable = runtime.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='session_records'",
  ).get() as { name: string } | undefined;

  if (!sessionRecordsTable) {
    runtime.db.exec(`
      CREATE TABLE session_records (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER,
        started_at INTEGER,
        ended_at INTEGER,
        metadata TEXT DEFAULT '{}'
      )
    `);

    runtime.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_records_updated_at
      ON session_records(updated_at);
      CREATE INDEX IF NOT EXISTS idx_session_records_kind
      ON session_records(kind);
    `);
  }

  const sessionMessagesTable = runtime.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='session_messages'",
  ).get() as { name: string } | undefined;

  if (!sessionMessagesTable) {
    runtime.db.exec(`
      CREATE TABLE session_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        created_at INTEGER,
        metadata TEXT DEFAULT '{}'
      )
    `);

    runtime.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_messages_session_id
      ON session_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_messages_sequence
      ON session_messages(session_id, sequence);
    `);
  }

  const userVersion = (runtime.db.pragma('user_version', { simple: true }) as number) ?? 0;
  if (userVersion < 1) {
    runtime.db.exec(`
      DELETE FROM blocks
      WHERE source = 'heartbeat:consolidation'
        AND annotation LIKE '%摘要%'
    `);
    runtime.db.pragma('user_version = 1');
  }
}
