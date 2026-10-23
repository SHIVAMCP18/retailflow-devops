// RetailFlow: a small store (website + REST API) backed by PostgreSQL.
import express from 'express';
import os from 'node:os';
import pg from 'pg';
import { validateOrder, validateProduct } from './validation.js';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));
const log = (...args) => console.log(new Date().toISOString(), ...args);

// Health check, used by Docker, Kubernetes and the CI/CD pipeline.
app.get('/health', async (_, res) => {
  try { await db.query('SELECT 1'); res.json({ status: 'UP' }); }
  catch { res.status(503).json({ status: 'DOWN' }); }
});

// Which version is running and on which server/pod (shows the CI/CD deploy and Kubernetes replicas).
app.get('/api/info', (_, res) => res.json({
  version: process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || 'dev',
  server: os.hostname()
}));

app.get('/api/products', async (_, res) => {
  const { rows } = await db.query('SELECT id, name, price::float AS price, stock FROM products ORDER BY id');
  res.json(rows);
});

app.post('/api/products', async (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  const { rows } = await db.query(
    'INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING id, name, price::float AS price, stock',
    [req.body.name.trim(), req.body.price, req.body.stock]);
  log('product added', rows[0].id);
  res.status(201).json(rows[0]);
});

app.get('/api/orders', async (_, res) => {
  const { rows } = await db.query(`SELECT o.id, p.name AS product, o.quantity, o.total::float AS total, o.created_at AS "createdAt"
                                   FROM orders o JOIN products p ON p.id = o.product_id ORDER BY o.id DESC LIMIT 50`);
  res.json(rows);
});

// Placing an order reduces the stock and saves the order in ONE transaction.
app.post('/api/orders', async (req, res) => {
  const errors = validateOrder(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING price',
      [req.body.quantity, req.body.productId]);
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Not enough stock' });
    }
    const order = await client.query(
      'INSERT INTO orders (product_id, quantity, total) VALUES ($1, $2, $3) RETURNING id, total::float AS total',
      [req.body.productId, req.body.quantity, rows[0].price * req.body.quantity]);
    await client.query('COMMIT');
    log('order placed', order.rows[0].id);
    res.status(201).json(order.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    log('order failed', error.message);
    res.status(500).json({ error: 'Could not place the order' });
  } finally { client.release(); }
});

async function start() {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY, name TEXT NOT NULL,
          price NUMERIC(10,2) NOT NULL CHECK (price >= 0), stock INT NOT NULL CHECK (stock >= 0));
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY, product_id INT NOT NULL REFERENCES products(id),
          quantity INT NOT NULL, total NUMERIC(10,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
      break;
    } catch (error) {
      if (attempt === 30) throw error;
      log('waiting for the database...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM products');
  if (rows[0].n === 0) {
    await db.query(`INSERT INTO products (name, price, stock) VALUES
      ('Wireless keyboard', 1499, 25), ('Noise-cancelling headset', 3999, 10), ('Desk lamp', 899, 15)`);
  }
  const port = Number(process.env.PORT || 8080); // cloud platforms like Render set PORT
  const server = app.listen(port, () => log(`RetailFlow listening on port ${port}`));
  // Graceful shutdown: finish open requests when Docker/Kubernetes stops the container.
  process.on('SIGTERM', () => server.close(() => db.end().then(() => process.exit(0))));
}

start().catch(error => { log('startup failed:', error.message); process.exit(1); });
