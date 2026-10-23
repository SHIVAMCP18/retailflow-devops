// RetailFlow: a small store (website + REST API) backed by PostgreSQL.
import express from 'express';
import os from 'node:os';
import pg from 'pg';
import { parseOrder, validateProduct, validateStock } from './validation.js';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const startedAt = new Date();
const log = (...args) => console.log(new Date().toISOString(), ...args);
// Express 4 does not catch errors from async handlers by itself.
const route = handler => (req, res, next) => handler(req, res).catch(next);

// Every response says which server/pod answered; every API call is logged.
app.use((req, res, next) => {
  const started = Date.now();
  res.set('X-Served-By', os.hostname());
  res.on('finish', () => {
    if (req.path.startsWith('/api')) log(req.method, req.originalUrl, res.statusCode, `${Date.now() - started}ms`);
  });
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));

// Health check, used by Docker, Kubernetes, Render and the CI/CD pipeline.
app.get('/health', async (_, res) => {
  const started = Date.now();
  try { await db.query('SELECT 1'); res.json({ status: 'UP', database: 'UP', dbMs: Date.now() - started }); }
  catch { res.status(503).json({ status: 'DOWN', database: 'DOWN' }); }
});

// Which version is running, where, and for how long (shows the CI/CD deploy and Kubernetes replicas).
app.get('/api/info', (_, res) => res.json({
  version: process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || 'dev',
  server: os.hostname(),
  platform: process.env.RENDER ? 'Render (cloud)' : process.env.KUBERNETES_SERVICE_HOST ? 'Kubernetes' : 'Docker',
  node: process.version,
  startedAt,
  uptimeSeconds: Math.round(process.uptime())
}));

const PRODUCT = 'id, name, category, description, price::float AS price, stock';

app.get('/api/products', route(async (_, res) => {
  const { rows } = await db.query(`SELECT ${PRODUCT} FROM products WHERE active ORDER BY category, name`);
  res.json(rows);
}));

app.post('/api/products', route(async (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  const { name, category, description, price, stock } = req.body;
  const { rows } = await db.query(
    `INSERT INTO products (name, category, description, price, stock) VALUES ($1, $2, $3, $4, $5) RETURNING ${PRODUCT}`,
    [name.trim(), category?.trim() || 'General', description?.trim() || '', price, stock]);
  log('product added', rows[0].id);
  res.status(201).json(rows[0]);
}));

app.patch('/api/products/:id', route(async (req, res) => {
  const errors = validateStock(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  const { rows } = await db.query(`UPDATE products SET stock = $1 WHERE id = $2 AND active RETURNING ${PRODUCT}`,
    [req.body.stock, Number(req.params.id) || 0]);
  if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
  res.json(rows[0]);
}));

// Removing a product only hides it, so old orders keep pointing to it.
app.delete('/api/products/:id', route(async (req, res) => {
  const { rowCount } = await db.query('UPDATE products SET active = false WHERE id = $1 AND active', [Number(req.params.id) || 0]);
  if (!rowCount) return res.status(404).json({ error: 'Product not found' });
  res.status(204).end();
}));

const ORDERS = `
  SELECT o.id, o.customer, o.total::float AS total, o.served_by AS "servedBy", o.created_at AS "createdAt",
         json_agg(json_build_object('productId', p.id, 'product', p.name, 'quantity', i.quantity, 'price', i.price::float) ORDER BY p.name) AS items
  FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id`;

app.get('/api/orders', route(async (_, res) => {
  const { rows } = await db.query(`${ORDERS} GROUP BY o.id ORDER BY o.id DESC LIMIT 50`);
  res.json(rows);
}));

app.get('/api/orders/:id', route(async (req, res) => {
  const { rows } = await db.query(`${ORDERS} WHERE o.id = $1 GROUP BY o.id`, [Number(req.params.id) || 0]);
  if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
  res.json(rows[0]);
}));

// Placing an order reduces the stock of every product and saves the order in
// ONE transaction: if any product is short, nothing changes at all.
app.post('/api/orders', route(async (req, res) => {
  const { errors, customer, items } = parseOrder(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    for (const item of items) {
      const { rows } = await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2 AND active AND stock >= $1 RETURNING name, price::float AS price',
        [item.quantity, item.productId]);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        const found = await db.query('SELECT name, stock FROM products WHERE id = $1 AND active', [item.productId]);
        return found.rows[0]
          ? res.status(409).json({ error: `Not enough stock: only ${found.rows[0].stock} left of ${found.rows[0].name}` })
          : res.status(404).json({ error: `Product ${item.productId} not found` });
      }
      item.price = rows[0].price;
      total += rows[0].price * item.quantity;
    }
    const order = await client.query(
      'INSERT INTO orders (customer, total, served_by) VALUES ($1, $2, $3) RETURNING id',
      [customer, total, os.hostname()]);
    const id = order.rows[0].id;
    for (const item of items) {
      await client.query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [id, item.productId, item.quantity, item.price]);
    }
    await client.query('COMMIT');
    log('order placed', id, `${items.length} product(s)`, total);
    res.status(201).json({ id, total, customer, items });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}));

// Numbers for the admin dashboard.
app.get('/api/stats', route(async (_, res) => {
  const [totals, top] = await Promise.all([
    db.query(`SELECT (SELECT COUNT(*) FROM products WHERE active)::int AS products,
                     (SELECT COUNT(*) FROM products WHERE active AND stock < 5)::int AS "lowStock",
                     (SELECT COUNT(*) FROM orders)::int AS orders,
                     (SELECT COALESCE(SUM(total), 0) FROM orders)::float AS revenue,
                     (SELECT COALESCE(SUM(quantity), 0) FROM order_items)::int AS "unitsSold"`),
    db.query(`SELECT p.name, SUM(i.quantity)::int AS sold FROM order_items i JOIN products p ON p.id = i.product_id
              WHERE p.active GROUP BY p.name ORDER BY sold DESC, p.name LIMIT 5`)
  ]);
  res.json({ ...totals.rows[0], topProducts: top.rows });
}));

app.use('/api', (_, res) => res.status(404).json({ error: 'Not found' }));
app.use((error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  log('request failed:', error.message);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

// Tables are created (and older versions upgraded) when the app starts.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0), stock INT NOT NULL CHECK (stock >= 0));
  ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General';
  ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
  ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY, customer TEXT NOT NULL DEFAULT 'Guest', total NUMERIC(10,2) NOT NULL,
    served_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer TEXT NOT NULL DEFAULT 'Guest';
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS served_by TEXT;
  CREATE TABLE IF NOT EXISTS order_items (
    order_id INT NOT NULL REFERENCES orders(id), product_id INT NOT NULL REFERENCES products(id),
    quantity INT NOT NULL CHECK (quantity > 0), price NUMERIC(10,2) NOT NULL, PRIMARY KEY (order_id, product_id));
  -- Version 1 stored one product per order in the orders table: move those into order_items.
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'product_id') THEN
      INSERT INTO order_items (order_id, product_id, quantity, price)
        SELECT id, product_id, quantity, total / quantity FROM orders ON CONFLICT DO NOTHING;
      ALTER TABLE orders DROP COLUMN product_id, DROP COLUMN quantity;
    END IF;
  END $$;
  -- Products left behind by older test runs.
  UPDATE products SET active = false WHERE name IN ('Test monitor', 'Test cable') AND active;`;

const CATALOG = [
  ['Wireless keyboard', 'Accessories', 1499, 25, 'Slim keyboard with quiet keys, works over Bluetooth or USB'],
  ['Wireless mouse', 'Accessories', 799, 40, 'Ergonomic mouse with a silent click'],
  ['USB-C hub', 'Accessories', 2199, 18, 'HDMI, two USB ports and an SD card reader'],
  ['Noise-cancelling headset', 'Audio', 3999, 10, 'Over-ear headset with a 30-hour battery'],
  ['Bluetooth speaker', 'Audio', 2499, 12, 'Small waterproof speaker for the desk or outside'],
  ['Desk lamp', 'Home office', 899, 15, 'LED lamp with three brightness levels'],
  ['Laptop stand', 'Home office', 1299, 20, 'Aluminium stand that lifts the screen to eye level'],
  ['Webcam 1080p', 'Home office', 2799, 4, 'Full HD camera with a built-in microphone']
];

async function start() {
  for (let attempt = 1; ; attempt++) {
    try { await db.query(SCHEMA); break; }
    catch (error) {
      if (attempt === 30) throw error;
      log('waiting for the database...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  // Add the demo catalogue; products that already exist (by name) are left as they are.
  for (const [name, category, price, stock, description] of CATALOG) {
    await db.query(`UPDATE products SET category = $2, description = $3 WHERE name = $1 AND category = 'General' AND description = ''`,
      [name, category, description]);
    await db.query(`INSERT INTO products (name, category, price, stock, description)
                    SELECT $1::text, $2::text, $3::numeric, $4::int, $5::text WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = $1::text)`,
      [name, category, price, stock, description]);
  }
  const port = Number(process.env.PORT || 8080); // cloud platforms like Render set PORT
  const server = app.listen(port, () => log(`RetailFlow listening on port ${port}`));
  // Graceful shutdown: finish open requests when Docker/Kubernetes stops the container.
  process.on('SIGTERM', () => server.close(() => db.end().then(() => process.exit(0))));
}

start().catch(error => { log('startup failed:', error.message); process.exit(1); });
