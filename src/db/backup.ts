import "dotenv/config";
import fs from "fs";
import path from "path";
import { all, getPool } from "./pool";

// Backup em JavaScript puro, sem depender do binário "pg_dump" estar
// instalado/no PATH — ele não está nesta máquina, e o projeto já tem "pg"
// como dependência, então dá pra gerar o .sql direto pela conexão.
//
//   npm run db:backup
//   npm run db:backup -- --out=./meus-backups --keep=30
//
// O arquivo sai como INSERTs, uma instrução por linha, na ordem em que as
// tabelas podem ser recarregadas sem violar chave estrangeira.

// Ordem de dependência: quem é referenciado vem antes de quem referencia.
// Restaurar segue esta ordem; o DELETE inicial vai na ordem inversa.
export const BACKUP_TABLES = [
  "users",
  "plans",
  "products",
  "customers",
  "sales",
  "payments",
  "subscriptions",
  "payments_history",
  "webhook_events",
  "admin_log",
  "invites",
];

// Ficam de fora de propósito: guardam credencial viva, não dado de negócio.
// Restaurar uma sessão ou um token de reset antigo não faz sentido (ambos
// expiram), e gravá-los num arquivo solto no disco só espalha credencial.
export const SKIPPED_TABLES = ["sessions", "password_resets"];

export const DEFAULT_BACKUP_KEEP = 14;

// Escapa um valor pra virar literal SQL do Postgres. Quebras de linha viram
// \n em vez de quebrar a linha de verdade: o arquivo mantém "uma instrução
// por linha", o que deixa a leitura na hora de restaurar trivial. E-string
// (E'...') é o que dá sentido a essas barras invertidas no Postgres.
export function sqlEscape(value: string | null): string {
  if (value === null) return "NULL";
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return `E'${escaped}'`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function tableColumns(table: string): Promise<string[]> {
  const rows = await all<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((r) => r.column_name);
}

export async function generateBackupSql(): Promise<{ sql: string; totalRows: number }> {
  const lines: string[] = [];
  lines.push(`-- Backup de dados do STRIX — gerado em ${new Date().toISOString()}`);
  lines.push(`-- Tabelas fora do backup (credencial viva): ${SKIPPED_TABLES.join(", ")}`);
  lines.push(`-- ATENÇÃO: contém hash de senha e dado de cliente. Não versionar, não subir em nuvem pública.`);
  lines.push("BEGIN;");

  // Limpa na ordem inversa da dependência, senão a FK reclama.
  for (const table of [...BACKUP_TABLES].reverse()) {
    lines.push(`DELETE FROM ${quoteIdent(table)};`);
  }

  let totalRows = 0;
  const restored: string[] = [];

  for (const table of BACKUP_TABLES) {
    const columns = await tableColumns(table);
    if (columns.length === 0) {
      lines.push(`\n-- Tabela: ${table} — NÃO ENCONTRADA no banco, pulada.`);
      console.warn(`  aviso: tabela "${table}" não existe no banco, pulando.`);
      continue;
    }
    restored.push(table);

    // Tudo sai como texto: assim nenhum tipo (NUMERIC, TIMESTAMPTZ, JSONB...)
    // passa pelo parser do driver e volta diferente do que estava. O literal
    // entre aspas é convertido de volta pela própria coluna no INSERT.
    const selectList = columns.map((c) => `${quoteIdent(c)}::text AS ${quoteIdent(c)}`).join(", ");
    const rows = await all<Record<string, string | null>>(
      `SELECT ${selectList} FROM ${quoteIdent(table)} ORDER BY 1`
    );
    totalRows += rows.length;

    lines.push(`\n-- Tabela: ${table} (${rows.length} linha(s))`);
    const columnList = columns.map(quoteIdent).join(", ");
    for (const row of rows) {
      const values = columns.map((c) => sqlEscape(row[c] ?? null)).join(", ");
      lines.push(`INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES (${values});`);
    }
  }

  // Os ids vieram gravados explicitamente, então a sequência do SERIAL ficou
  // para trás — sem isto, o primeiro INSERT depois de restaurar bate de
  // frente com um id que já existe.
  lines.push("\n-- Recoloca as sequências dos SERIAL à frente do maior id restaurado.");
  for (const table of restored) {
    lines.push(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${quoteIdent(table)}), 1), (SELECT MAX(id) FROM ${quoteIdent(table)}) IS NOT NULL) WHERE pg_get_serial_sequence('${table}', 'id') IS NOT NULL;`
    );
  }

  lines.push("\nCOMMIT;");
  return { sql: lines.join("\n"), totalRows };
}

export function backupFileName(date = new Date()): string {
  // Timestamp ISO sem : nem . — ordena cronologicamente por nome sozinho,
  // o que a limpeza de retenção abaixo aproveita.
  return `strix_${date.toISOString().replace(/[:.]/g, "-")}.sql`;
}

export async function writeBackupFile(outDir: string): Promise<{ filePath: string; totalRows: number }> {
  const { sql, totalRows } = await generateBackupSql();
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, backupFileName());
  fs.writeFileSync(filePath, sql, "utf-8");
  return { filePath, totalRows };
}

/** Apaga backups antigos além dos "keep" mais recentes. Retorna quantos foram removidos. */
export function cleanupOldBackups(outDir: string, keep: number): number {
  if (!Number.isFinite(keep) || keep <= 0) return 0;
  const files = fs
    .readdirSync(outDir)
    .filter((f) => /^strix_.*\.sql$/.test(f))
    .sort()
    .reverse();
  let removed = 0;
  for (const file of files.slice(keep)) {
    fs.unlinkSync(path.join(outDir, file));
    removed++;
  }
  return removed;
}

function parseArgs() {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([a-zA-Z0-9_]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const outDir = path.resolve(args.out || path.join(process.cwd(), "backups"));
  const keep = args.keep ? Number(args.keep) : DEFAULT_BACKUP_KEEP;

  console.log("Fazendo backup do banco do STRIX...");
  const { filePath, totalRows } = await writeBackupFile(outDir);
  const stats = fs.statSync(filePath);
  console.log(`  ${totalRows} linha(s) no total.`);
  console.log(`  Salvo em: ${filePath} (${(stats.size / 1024).toFixed(1)} KB)`);

  const removed = cleanupOldBackups(outDir, keep);
  if (removed > 0) console.log(`  Removidos ${removed} backup(s) antigo(s) (mantendo os ${keep} mais recentes).`);

  await getPool().end();
  console.log("\nBackup concluído.");
  process.exit(0);
}

// Só roda o CLI quando chamado direto (o arquivo também exporta as funções).
if (process.argv[1] && /backup\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error("Erro ao fazer backup:", err);
    process.exit(1);
  });
}
