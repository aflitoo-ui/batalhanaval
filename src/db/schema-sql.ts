export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_buy_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  default_sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit_buy_price NUMERIC(12,2) NOT NULL,
  unit_sell_price NUMERIC(12,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  paid_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

-- Migração de bancos criados antes do multi-usuário: adiciona as colunas que
-- faltarem, preenche as linhas antigas com o dono do primeiro usuário
-- (role='admin', o dono original do sistema) e só então torna obrigatório.
-- Tudo abaixo é seguro de rodar de novo (idempotente) tanto num banco novo
-- quanto num banco que já tem essas colunas.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE products ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1) AND role = 'user'
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');

UPDATE products SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;
UPDATE sales SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL;

ALTER TABLE products ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sales ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_name_key;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_user_id_name_key;
ALTER TABLE products ADD CONSTRAINT products_user_id_name_key UNIQUE (user_id, name);

CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
`;
