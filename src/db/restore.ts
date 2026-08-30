import "dotenv/config";
import fs from "fs";
import path from "path";
import { all, get, getPool, withTransaction } from "./pool";
import { BACKUP_TABLES, SKIPPED_TABLES } from "./backup";

// Restaura um arquivo gerado pelo "npm run db:backup".
//
//   npm run db:restore -- --file=backups/strix_2026-08-30T17-00-32-022Z.sql
//   npm run db:restore -- --file=... --yes
//
// Sem --yes ele NÃO escreve nada: mostra o alvo e o que faria, e para. É de
// propósito — o arquivo começa apagando todas as tabelas, e o estrago de
// apontar isso pro banco errado não tem desfazer.
//
// Tudo roda dentro de uma transação só: ou o restore inteiro entra, ou o
// banco fica exatamente como estava. Não existe estado pela metade.

function parseArgs() {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([a-zA-Z0-9_]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? "true";
  }
  return args;
}

/** Descreve o destino a partir da DATABASE_URL, sem expor a senha. */
function describeTarget(): { host: string; database: string; user: string } {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL não configurada.");
  const url = new URL(raw);
  return {
    host: url.hostname,
    database: url.pathname.replace(/^\//, "") || "(padrão)",
    user: url.username || "(padrão)",
  };
}

export type ParsedBackup = {
  statements: string[];
  insertsByTable: Record<string, number>;
  deletes: number;
  setvals: number;
};

/**
 * O arquivo de backup é uma instrução por linha, então a leitura é linha a
 * linha mesmo. BEGIN/COMMIT do arquivo saem daqui: quem controla a transação
 * é o withTransaction, que também sabe dar ROLLBACK se algo falhar.
 */
export function parseBackupFile(sql: string): ParsedBackup {
  const statements: string[] = [];
  const insertsByTable: Record<string, number> = {};
  let deletes = 0;
  let setvals = 0;

  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    const stmt = line.trim();
    if (!stmt) continue;
    if (stmt.startsWith("--")) continue;
    if (/^(BEGIN|COMMIT|END);?$/i.test(stmt)) continue;

    const insert = stmt.match(/^INSERT INTO "([^"]+)"/);
    if (insert) insertsByTable[insert[1]] = (insertsByTable[insert[1]] ?? 0) + 1;
    else if (/^DELETE FROM /i.test(stmt)) deletes++;
    else if (/^SELECT setval\(/i.test(stmt)) setvals++;

    statements.push(stmt);
  }

  return { statements, insertsByTable, deletes, setvals };
}

async function tableCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const row = await get<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}"`);
    counts[table] = Number(row?.n ?? 0);
  }
  return counts;
}

export async function applyRestore(statements: string[]): Promise<void> {
  await withTransaction(async (tx) => {
    for (let i = 0; i < statements.length; i++) {
      try {
        await tx.all(statements[i]);
      } catch (err) {
        const snippet = statements[i].slice(0, 160);
        throw new Error(
          `Falhou na instrução ${i + 1} de ${statements.length}:\n  ${snippet}\n  ${(err as Error).message}`
        );
      }
    }
  });
}

// Depois que a transação fecha, dizer "nada foi alterado" numa falha
// posterior (numa conferência, por exemplo) seria mentira perigosa.
let applied = false;

async function main() {
  const args = parseArgs();

  if (!args.file) {
    console.error("Faltou o arquivo. Ex.: npm run db:restore -- --file=backups/strix_....sql");
    process.exit(1);
  }
  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  const parsed = parseBackupFile(fs.readFileSync(filePath, "utf-8"));
  const target = describeTarget();
  const totalInserts = Object.values(parsed.insertsByTable).reduce((a, b) => a + b, 0);

  console.log("Arquivo:", filePath);
  console.log("Destino:", `${target.user}@${target.host}/${target.database}`);
  console.log("");
  console.log(`  ${parsed.deletes} tabela(s) serão esvaziadas antes de recarregar.`);
  console.log(`  ${totalInserts} linha(s) serão inseridas:`);
  for (const [table, n] of Object.entries(parsed.insertsByTable)) {
    console.log(`    ${table.padEnd(18)} ${String(n).padStart(4)}`);
  }
  console.log(`  ${parsed.setvals} sequência(s) de SERIAL serão recolocadas.`);
  console.log(`  Fora do arquivo (seguem como estão): ${SKIPPED_TABLES.join(", ")}`);

  if (!args.yes) {
    console.log("");
    console.log("Nada foi alterado. Confira o destino acima e, se estiver certo, repita com --yes.");
    await getPool().end();
    process.exit(0);
  }

  const antes = await tableCounts();
  console.log("");
  console.log("Restaurando (transação única — se falhar, nada muda)...");

  await applyRestore(parsed.statements);
  applied = true;

  const depois = await tableCounts();
  console.log("");
  console.log("Tabela              antes  depois");
  for (const table of BACKUP_TABLES) {
    console.log(`  ${table.padEnd(18)} ${String(antes[table]).padStart(4)}  ${String(depois[table]).padStart(6)}`);
  }

  // Se a sequência não avançou, o próximo cadastro pelo site quebraria com
  // "duplicate key" — vale conferir aqui e não descobrir em produção. Só
  // olha tabela que tem coluna "id"; "sessions", por exemplo, é chaveada
  // pelo token e não tem sequência nenhuma.
  const seqProblems = await all<{ tabela: string }>(
    `SELECT t.table_name AS tabela
       FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND EXISTS (SELECT 1 FROM information_schema.columns c
                     WHERE c.table_schema = 'public'
                       AND c.table_name = t.table_name
                       AND c.column_name = 'id')
        AND pg_get_serial_sequence('public.' || quote_ident(t.table_name), 'id') IS NOT NULL
        AND COALESCE((SELECT s.last_value FROM pg_sequences s
                       WHERE s.schemaname = 'public'
                         AND 'public.' || quote_ident(s.sequencename)
                             = pg_get_serial_sequence('public.' || quote_ident(t.table_name), 'id')), 0) = 0`
  );
  // Tabela fora do backup pode ter sequência zerada sem que isso seja
  // problema — "password_resets" nunca é restaurada, então avisar sobre ela
  // só treinaria você a ignorar o aviso.
  const relevantes = seqProblems.map((r) => r.tabela).filter((t) => !SKIPPED_TABLES.includes(t));
  if (relevantes.length > 0) {
    console.log("");
    console.log(`Aviso: sequência não conferida em: ${relevantes.join(", ")}`);
  }

  await getPool().end();
  console.log("\nRestore concluído.");
  process.exit(0);
}

if (process.argv[1] && /restore\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : err;
    if (applied) {
      console.error("\nO restore FOI aplicado, mas algo falhou depois dele:", msg);
      console.error("O banco está com os dados do arquivo. Confira antes de rodar de novo.");
    } else {
      console.error("\nErro ao restaurar (nada foi alterado):", msg);
    }
    process.exit(1);
  });
}
