import "dotenv/config";
import { getPool } from "./pool";
import { hashPassword } from "../lib/password";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      "Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env antes de rodar o seed (é o login que você vai usar)."
    );
    process.exit(1);
  }

  const pool = getPool();
  const passwordHash = hashPassword(password);
  await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email.trim().toLowerCase(), passwordHash]
  );
  console.log(`Usuário admin pronto: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro ao rodar seed:", err);
  process.exit(1);
});
