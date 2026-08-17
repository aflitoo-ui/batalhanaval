import { Pool, type QueryResultRow } from "pg";

/**
 * Pool único de conexões Postgres (banco privado, ex: Neon). Criado sob
 * demanda e reaproveitado entre requisições.
 */
let pool: Pool | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ${name} não configurada. Veja o arquivo .env.example.`
    );
  }
  return value;
}

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: requiredEnv("DATABASE_URL"),
    ssl: process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
  return pool;
}

export async function all<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

export async function get<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await all<T>(sql, params);
  return rows[0];
}

export async function run<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await getPool().query<T>(sql, params);
  return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}

export type TxHelpers = {
  all: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<R[]>;
  get: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<R | undefined>;
};

/** Roda várias queries numa única transação (BEGIN/COMMIT, ROLLBACK em erro). */
export async function withTransaction<T>(fn: (tx: TxHelpers) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const tx: TxHelpers = {
      all: async (sql, params = []) => (await client.query(sql, params)).rows,
      get: async (sql, params = []) => (await client.query(sql, params)).rows[0],
    };
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
