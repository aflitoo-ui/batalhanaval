import "dotenv/config";
import { getPool } from "./pool";
import { SCHEMA_SQL } from "./schema-sql";

async function main() {
  const pool = getPool();
  await pool.query(SCHEMA_SQL);
  console.log("Migração concluída.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro ao migrar:", err);
  process.exit(1);
});
