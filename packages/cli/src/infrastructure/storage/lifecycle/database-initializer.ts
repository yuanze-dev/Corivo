import { ensureDatabaseSchema } from '@/infrastructure/storage/schema/database-schema.js';

interface DatabaseInitializerSqliteDb {
  pragma(input: string): unknown;
}

interface DatabaseSchemaSqliteDb extends DatabaseInitializerSqliteDb {
  prepare(sql: string): unknown;
  exec(sql: string): void;
}

export interface InitializeCorivoSqliteDatabaseOptions {
  db: DatabaseSchemaSqliteDb;
  enableEncryption: boolean;
  key?: Buffer;
}

export interface CorivoSqliteInitializationResult {
  useSQLCipher: boolean;
}

export function initializeCorivoSqliteDatabase(
  options: InitializeCorivoSqliteDatabaseOptions,
): CorivoSqliteInitializationResult {
  const { db, enableEncryption, key } = options;

  let useSQLCipher = false;
  if (enableEncryption) {
    useSQLCipher = trySetupSQLCipher(db, key);
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');

  ensureDatabaseSchema({ db });

  return { useSQLCipher };
}

function trySetupSQLCipher(db: DatabaseInitializerSqliteDb, key?: Buffer): boolean {
  try {
    if (!key) {
      throw new Error('Missing database key');
    }

    const hexKey = key.toString('hex');
    db.pragma(`key = "x'${hexKey}'"`);

    const result = db.pragma('cipher_version');
    const useSQLCipher = result !== undefined;

    if (useSQLCipher) {
      db.pragma('kdf_iter = 256000');
      db.pragma('cipher_page_size = 4096');
    }

    return useSQLCipher;
  } catch {
    return false;
  }
}
