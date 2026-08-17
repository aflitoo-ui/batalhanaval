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
  notes TEXT,
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

-- Assinaturas pagas (SaaS): cada usuário tem uma assinatura, que começa em
-- trial e vira paga através de eventos de webhook do gateway de pagamento
-- (nunca por retorno do navegador).
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;

CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  interval TEXT NOT NULL DEFAULT 'month',
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  provider TEXT NOT NULL DEFAULT 'asaas',
  provider_customer_id TEXT,
  provider_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ,
  current_period_end DATE,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments_history (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  provider_payment_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_history_subscription ON payments_history(subscription_id);

INSERT INTO plans (code, name, price, interval)
  VALUES ('mensal-2990', 'Plano Mensal', 29.90, 'month')
  ON CONFLICT (code) DO NOTHING;

-- Cadastro de clientes: antes o nome do cliente era texto livre em cada
-- venda, o que fragmentava o mesmo cliente em vários nomes diferentes nos
-- relatórios. Agora vendas referenciam um cliente cadastrado (mesma lógica
-- de produtos), e o nome exibido vem sempre do cadastro (join), não mais
-- congelado na venda.
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);

-- Migra vendas antigas: cria um cliente cadastrado pra cada nome distinto já
-- usado e liga as vendas a ele. Idempotente (só afeta linhas sem customer_id).
INSERT INTO customers (user_id, name)
  SELECT DISTINCT user_id, customer_name FROM sales WHERE customer_id IS NULL
  ON CONFLICT (user_id, name) DO NOTHING;

UPDATE sales s SET customer_id = c.id
  FROM customers c
  WHERE s.customer_id IS NULL AND c.user_id = s.user_id AND c.name = s.customer_name;

ALTER TABLE sales ALTER COLUMN customer_name DROP NOT NULL;

-- Observação por pagamento (ex: "recebi 20 no dinheiro e 100 no pix").
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
`;
