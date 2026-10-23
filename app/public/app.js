// RetailFlow website: a small single-page app in plain JavaScript (no build step).
// Pages: #/shop, #/orders, #/orders/<id>, #/admin, #/devops

const REPO = 'https://github.com/SHIVAMCP18/retailflow-devops';
const view = document.getElementById('view');
const state = { products: [], cart: [], category: 'All', search: '', justPlaced: null };

// ---------- helpers ----------
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(amount || 0));
const when = date => new Date(date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const file = path => `<a href="${REPO}/blob/main/${path}" target="_blank" rel="noopener">${esc(path)}</a>`;

const ICONS = {
  shop: 'M6 7h12l-1 13H7L6 7Zm3 0a3 3 0 0 1 6 0',
  orders: 'M4 7l8-4 8 4-8 4-8-4Zm0 0v10l8 4m-8-14 8 4m8-4v10l-8 4m0-10v10',
  admin: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z',
  system: 'M4 5h7v6H4V5Zm9 0h7v6h-7V5ZM4 13h7v6H4v-6Zm9 3h7m-3.5-3.5v7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  chevron: 'M9 6l6 6-6 6',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4m-8 4v8',
  docker: 'M3 13h18c0 4-3 7-9 7s-9-3-9-7Zm3-3h3v3H6v-3Zm4 0h3v3h-3v-3Zm4 0h3v3h-3v-3Zm-4-4h3v3h-3V6Z',
  code: 'M8 8l-4 4 4 4m8-8 4 4-4 4M14 5l-4 14',
  cluster: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  pipeline: 'M4 6h5v5H4V6Zm11 7h5v5h-5v-5ZM9 8.5h3a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2',
  lock: 'M6 11h12v9H6v-9Zm2 0V8a4 4 0 0 1 8 0v3',
  cloud: 'M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18H7Z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'
};
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
document.querySelectorAll('svg[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });

let toastTimer;
function toast(message, kind = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = message; el.className = `toast ${kind}`; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// ---------- API client + live request log ----------
const requestLog = [];
async function api(method, path, body, { quiet = false } = {}) {
  const started = performance.now();
  let response;
  try {
    response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('The server is not reachable. On the free plan it may be waking up, try again in a few seconds.');
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!quiet) {
    requestLog.unshift({ method, path, status: response.status, ms: Math.round(performance.now() - started), server: response.headers.get('X-Served-By') || '-', at: new Date() });
    requestLog.length = Math.min(requestLog.length, 40);
    renderLog();
  }
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function renderLog() {
  document.getElementById('apilog-count').textContent = `· ${requestLog.length} API call${requestLog.length === 1 ? '' : 's'} to the server`;
  document.getElementById('apilog-body').innerHTML = requestLog.length ? `<table><tbody>${requestLog.map(e => `
    <tr><td class="mono">${e.at.toLocaleTimeString()}</td><td><span class="method ${e.method}">${e.method}</span></td>
      <td class="mono">${esc(e.path)}</td><td><span class="status s${String(e.status)[0]}">${e.status}</span></td>
      <td>${e.ms} ms</td><td class="muted">answered by <span class="mono">${esc(e.server)}</span></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Nothing yet. Every request the page makes to the REST API shows up here.</p>';
}
document.getElementById('apilog-toggle').addEventListener('click', () => {
  const body = document.getElementById('apilog-body');
  body.hidden = !body.hidden;
  document.getElementById('apilog-chev').textContent = body.hidden ? 'Show' : 'Hide';
});

// ---------- server status in the sidebar ----------
async function refreshStatus() {
  const [health, info] = await Promise.all([
    api('GET', '/health', null, { quiet: true }).catch(() => null),
    api('GET', '/api/info', null, { quiet: true }).catch(() => null)
  ]);
  document.getElementById('status-dot').className = `dot ${health?.status === 'UP' ? 'up' : 'down'}`;
  document.getElementById('status-text').textContent = health?.status === 'UP' ? 'All systems running' : 'Server not reachable';
  if (info) {
    document.getElementById('side-version').textContent = info.version.slice(0, 7);
    document.getElementById('side-server').textContent = info.server;
  }
  return { health, info };
}
refreshStatus();
setInterval(refreshStatus, 15000);

// ---------- router ----------
const pages = { shop: renderShop, orders: renderOrders, admin: renderAdmin, devops: renderDevops };
let renderId = 0;
let pageTimer = null;

function router() {
  const [page = 'shop', param] = location.hash.replace(/^#\/?/, '').split('/');
  const name = pages[page] ? page : 'shop';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === name));
  clearInterval(pageTimer);
  view.onclick = view.onsubmit = view.oninput = null;
  view.innerHTML = '<p class="loading"><span class="spinner"></span>Loading...</p>';
  const id = ++renderId;
  const stale = () => id !== renderId;
  pages[name](param, stale).catch(error => {
    if (!stale()) view.innerHTML = `<div class="card empty"><h2>Could not load this page</h2><p>${esc(error.message)}</p><button class="primary" onclick="location.reload()">Try again</button></div>`;
  });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', router);

// ---------- Shop ----------
const TONES = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e'];
function productArt(p) {
  const initials = p.name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<div class="product-art" style="--tone:${TONES[p.id % TONES.length]}"><span>${esc(initials)}</span></div>`;
}
function stockLabel(stock) {
  if (stock < 1) return '<span class="stock out">Out of stock</span>';
  if (stock < 5) return `<span class="stock low">Only ${stock} left</span>`;
  return '<span class="stock">In stock</span>';
}
function updateCartBadge() {
  const count = state.cart.reduce((n, l) => n + l.quantity, 0);
  const badge = document.getElementById('cart-badge');
  badge.textContent = count; badge.hidden = count === 0;
}
function savedName() { try { return localStorage.getItem('rf_name') || ''; } catch { return ''; } }

async function renderShop(_, stale) {
  const products = await api('GET', '/api/products');
  if (stale()) return;
  state.products = products;
  // Keep the cart in line with the latest stock.
  state.cart = state.cart
    .map(l => ({ product: products.find(p => p.id === l.product.id), quantity: l.quantity }))
    .filter(l => l.product && l.product.stock > 0)
    .map(l => ({ ...l, quantity: Math.min(l.quantity, l.product.stock) }));
  updateCartBadge();

  view.innerHTML = `
    <div class="shop">
      <div>
        <header class="page-head">
          <div><h1>Shop</h1><p class="muted" id="count"></p></div>
          <input class="search" id="search" type="search" placeholder="Search products" value="${esc(state.search)}">
        </header>
        <div class="chips" id="chips"></div>
        <div class="grid" id="grid"></div>
      </div>
      <aside class="card cart" id="cart"></aside>
    </div>`;
  drawProducts();
  drawCart();

  view.oninput = event => {
    if (event.target.id === 'search') { state.search = event.target.value; drawProducts(); }
  };
  view.onclick = event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const line = state.cart.find(l => l.product.id === id);
    const action = button.dataset.action;
    if (action === 'category') { state.category = button.dataset.category; drawProducts(); }
    if (action === 'add' || action === 'inc') {
      const product = state.products.find(p => p.id === id);
      if ((line?.quantity || 0) >= product.stock) return toast(`Sorry, only ${product.stock} left in stock`, 'error');
      line ? line.quantity++ : state.cart.push({ product, quantity: 1 });
      if (action === 'add') toast(`${product.name} added to the cart`);
    }
    if (action === 'dec') { line.quantity--; state.cart = state.cart.filter(l => l.quantity > 0); }
    if (action === 'checkout') return checkout(button);
    drawCart(); updateCartBadge();
  };
}

function drawProducts() {
  const categories = ['All', ...new Set(state.products.map(p => p.category))];
  if (!categories.includes(state.category)) state.category = 'All';
  const term = state.search.trim().toLowerCase();
  const shown = state.products.filter(p => (state.category === 'All' || p.category === state.category)
    && (!term || `${p.name} ${p.description}`.toLowerCase().includes(term)));
  document.getElementById('count').textContent = `${shown.length} product${shown.length === 1 ? '' : 's'}`;
  document.getElementById('chips').innerHTML = categories.map(c =>
    `<button class="chip ${c === state.category ? 'active' : ''}" data-action="category" data-category="${esc(c)}">${esc(c)}</button>`).join('');
  document.getElementById('grid').innerHTML = shown.length ? shown.map(p => `
    <div class="card product">
      ${productArt(p)}
      <span class="tag">${esc(p.category)}</span>
      <h3>${esc(p.name)}</h3>
      <p class="desc">${esc(p.description)}</p>
      <div class="row between"><strong class="price">${money(p.price)}</strong>${stockLabel(p.stock)}</div>
      <button class="primary" data-action="add" data-id="${p.id}" ${p.stock < 1 ? 'disabled' : ''}>Add to cart</button>
    </div>`).join('') : '<div class="card empty">No products match your search.</div>';
}

function drawCart() {
  const total = state.cart.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  document.getElementById('cart').innerHTML = `
    <h2>Your cart</h2>
    ${state.cart.length === 0 ? '<p class="muted">Nothing here yet. Add something from the shop.</p>' : ''}
    ${state.cart.map(l => `
      <div class="cart-line">
        <div><strong>${esc(l.product.name)}</strong><small class="muted">${money(l.product.price)} each</small></div>
        <div class="qty">
          <button aria-label="Remove one" data-action="dec" data-id="${l.product.id}">${icon('minus', 14)}</button><span>${l.quantity}</span>
          <button aria-label="Add one" data-action="inc" data-id="${l.product.id}">${icon('plus', 14)}</button>
        </div>
      </div>`).join('')}
    ${state.cart.length ? `
      <div class="row between total"><span>Total</span><strong>${money(total)}</strong></div>
      <label>Your name<input id="customer" maxlength="60" placeholder="Guest" value="${esc(savedName())}"></label>
      <button class="primary wide" data-action="checkout">Place order</button>
      <p class="muted small">Stock is reserved for every product in one database transaction.</p>` : ''}`;
}

async function checkout(button) {
  const customer = document.getElementById('customer').value.trim();
  try { localStorage.setItem('rf_name', customer); } catch { /* private mode */ }
  button.disabled = true; button.textContent = 'Placing order...';
  try {
    const order = await api('POST', '/api/orders', { customer, items: state.cart.map(l => ({ productId: l.product.id, quantity: l.quantity })) });
    state.cart = []; state.justPlaced = order.id; updateCartBadge();
    location.hash = `#/orders/${order.id}`;
  } catch (error) {
    toast(error.message, 'error');
    button.disabled = false; button.textContent = 'Place order';
    if (error.status === 409 || error.status === 404) router();
  }
}

// ---------- Orders ----------
const itemSummary = items => items.map(i => `${i.quantity} x ${i.product}`).join(', ');

async function renderOrders(id, stale) {
  if (id) return renderOrder(id, stale);
  const orders = await api('GET', '/api/orders');
  if (stale()) return;
  view.innerHTML = `
    <header class="page-head"><div><h1>Orders</h1><p class="muted">The latest ${orders.length} order${orders.length === 1 ? '' : 's'} placed in the store</p></div>
      <a class="button" href="#/shop">${icon('shop', 16)} Continue shopping</a></header>
    ${orders.length ? `<div class="list">${orders.map(o => `
      <a class="card list-row" href="#/orders/${o.id}">
        <div><strong>#${o.id}</strong><small class="muted">${when(o.createdAt)}</small></div>
        <div class="hide-sm">${esc(o.customer)}</div>
        <div class="hide-sm muted">${esc(itemSummary(o.items))}</div>
        <strong>${money(o.total)}</strong>
        <span class="muted hide-sm">${icon('chevron', 16)}</span>
      </a>`).join('')}</div>`
    : `<div class="card empty"><h2>No orders yet</h2><p>Add something to the cart and place the first order.</p><a class="button primary" href="#/shop">Go to the shop</a></div>`}`;
}

async function renderOrder(id, stale) {
  const order = await api('GET', `/api/orders/${encodeURIComponent(id)}`);
  if (stale()) return;
  const isNew = state.justPlaced === order.id;
  state.justPlaced = null;
  view.innerHTML = `
    <a class="link-back" href="#/orders">${icon('back', 16)} All orders</a>
    <header class="page-head"><div><h1>Order #${order.id}</h1><p class="muted">Placed ${when(order.createdAt)}</p></div><span class="pill ok">Confirmed</span></header>
    ${isNew ? `<div class="card notice"><strong>Thank you, your order is confirmed.</strong>
      <p>The server reduced the stock of ${order.items.length === 1 ? 'the product' : `all ${order.items.length} products`} and saved the order in one PostgreSQL transaction. If any product had been short, nothing would have changed.</p></div>` : ''}
    <div class="detail">
      <div class="card table-card">
        <table class="table">
          <thead><tr><th>Product</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Subtotal</th></tr></thead>
          <tbody>${order.items.map(i => `<tr><td>${esc(i.product)}</td><td class="num">${money(i.price)}</td><td class="num">${i.quantity}</td><td class="num">${money(i.price * i.quantity)}</td></tr>`).join('')}
            <tr><td colspan="3"><strong>Total</strong></td><td class="num"><strong>${money(order.total)}</strong></td></tr></tbody>
        </table>
      </div>
      <div class="card">
        <h2>Details</h2>
        <dl class="meta">
          <dt>Customer</dt><dd>${esc(order.customer)}</dd>
          <dt>Items</dt><dd>${order.items.reduce((n, i) => n + i.quantity, 0)}</dd>
          <dt>Handled by</dt><dd class="mono">${esc(order.servedBy || '-')}</dd>
        </dl>
        <p class="muted small" style="margin-top:14px">"Handled by" is the server or Kubernetes pod that saved this order.</p>
      </div>
    </div>`;
}

// ---------- Admin ----------
async function renderAdmin(_, stale) {
  const [stats, products] = await Promise.all([api('GET', '/api/stats'), api('GET', '/api/products')]);
  if (stale()) return;
  const best = stats.topProducts[0]?.sold || 1;
  const categories = [...new Set(products.map(p => p.category))];
  view.innerHTML = `
    <header class="page-head"><div><h1>Admin</h1><p class="muted">Manage the catalogue and see how the store is doing</p></div></header>
    <div class="stats">
      <div class="card stat"><small>Revenue</small><strong>${money(stats.revenue)}</strong></div>
      <div class="card stat"><small>Orders</small><strong>${stats.orders}</strong></div>
      <div class="card stat"><small>Units sold</small><strong>${stats.unitsSold}</strong></div>
      <div class="card stat"><small>Low on stock</small><strong>${stats.lowStock} <span class="muted small">of ${stats.products}</span></strong></div>
    </div>
    <div class="admin-grid">
      <div class="list">
        <form class="card" id="add-product">
          <h2>Add a product</h2>
          <label>Name<input name="name" required minlength="2" maxlength="60" placeholder="Mechanical keyboard"></label>
          <label>Category<input name="category" list="categories" maxlength="30" placeholder="Accessories"></label>
          <datalist id="categories">${categories.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
          <div class="form-row">
            <label>Price (Rs)<input name="price" type="number" min="0" step="0.01" required></label>
            <label>Stock<input name="stock" type="number" min="0" step="1" required></label>
          </div>
          <label>Description<textarea name="description" maxlength="200" placeholder="One line about the product"></textarea></label>
          <button class="primary wide">Add product</button>
        </form>
        <div class="card">
          <h2>Best sellers</h2>
          ${stats.topProducts.length ? stats.topProducts.map(t => `
            <div class="top-line"><div class="row between"><span>${esc(t.name)}</span><span class="muted">${t.sold} sold</span></div>
              <div class="bar"><span style="width:${Math.round(t.sold / best * 100)}%"></span></div></div>`).join('')
            : '<p class="muted">No sales yet.</p>'}
        </div>
      </div>
      <div class="card table-card">
        <table class="table">
          <thead><tr><th>Product</th><th>Category</th><th class="num">Price</th><th>Stock</th><th></th></tr></thead>
          <tbody>${products.map(p => `
            <tr>
              <td><strong>${esc(p.name)}</strong></td>
              <td class="muted">${esc(p.category)}</td>
              <td class="num">${money(p.price)}</td>
              <td><div class="row"><input type="number" min="0" step="1" value="${p.stock}" id="stock-${p.id}" aria-label="Stock of ${esc(p.name)}">
                <button class="small" data-action="stock" data-id="${p.id}">Save</button>
                ${p.stock < 5 ? `<span class="pill ${p.stock < 1 ? 'bad' : 'warn'}">${p.stock < 1 ? 'Out' : 'Low'}</span>` : ''}</div></td>
              <td><button class="small danger" data-action="remove" data-id="${p.id}" data-name="${esc(p.name)}">Remove</button></td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;

  view.onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const product = await api('POST', '/api/products', {
        name: form.get('name'), category: form.get('category') || undefined, description: form.get('description') || undefined,
        price: Number(form.get('price')), stock: Number(form.get('stock'))
      });
      toast(`${product.name} added to the shop`);
      router();
    } catch (error) { toast(error.message, 'error'); }
  };
  view.onclick = async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    try {
      if (button.dataset.action === 'stock') {
        const product = await api('PATCH', `/api/products/${id}`, { stock: Number(document.getElementById(`stock-${id}`).value) });
        toast(`Stock of ${product.name} is now ${product.stock}`);
      } else {
        if (!confirm(`Remove ${button.dataset.name} from the shop? Old orders keep it.`)) return;
        await api('DELETE', `/api/products/${id}`);
        toast(`${button.dataset.name} removed`);
      }
      router();
    } catch (error) { toast(error.message, 'error'); }
  };
}

// ---------- How it's built (DevOps) ----------
function uptime(seconds) {
  const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${seconds % 60}s`;
}

const PARTS = [
  { icon: 'box', title: 'Microservice', text: 'One independent, stateless Node.js service with its own PostgreSQL database and a REST API.',
    points: ['Health endpoint used by every platform', 'Graceful shutdown on SIGTERM', 'Runs as 2 replicas on Kubernetes'], files: ['app/src/server.js'] },
  { icon: 'docker', title: 'Docker', text: 'The app is packaged as a small image; Docker Compose runs the full stack with one command.',
    points: ['node:22-alpine, production dependencies only', 'Runs as a non-root user with a HEALTHCHECK', 'Compose: app + PostgreSQL + Caddy (HTTPS proxy)'], files: ['app/Dockerfile', 'docker-compose.yml', 'Caddyfile'] },
  { icon: 'code', title: 'Infrastructure as Code', text: 'Terraform creates the cloud database and web service on Render. Nothing is clicked by hand.',
    points: ['render_postgres: PostgreSQL 16 (free)', 'render_web_service: built from this repo\'s Dockerfile', 'terraform apply prints the live URL'], files: ['terraform/main.tf'] },
  { icon: 'cluster', title: 'Kubernetes', text: 'Manifests for a Namespace, the database StatefulSet and the app Deployment.',
    points: ['2 replicas with readiness and liveness probes', 'Persistent volume for PostgreSQL', 'Password from a Secret, read-only filesystem'], files: ['k8s/app.yaml', 'k8s/database.yaml', 'k8s/deploy.sh'] },
  { icon: 'pipeline', title: 'CI/CD', text: 'GitHub Actions runs on every push: test, scan, build, test on Kubernetes, deploy.',
    points: ['Image pushed to GitHub Container Registry', 'A real kind cluster is created in CI to test the manifests', 'Deploys the exact commit and checks the live site'], files: ['.github/workflows/ci-cd.yml'] },
  { icon: 'lock', title: 'DevSecOps', text: 'Security checks are part of the pipeline and stop it when something serious is found.',
    points: ['Gitleaks: no passwords or keys in Git', 'Trivy: dependencies, image and config scans', 'Dependabot opens update pull requests'], files: ['.github/dependabot.yml'] },
  { icon: 'cloud', title: 'Cloud', text: 'Hosted on Render\'s free plan: a Docker web service plus a managed PostgreSQL database.',
    points: ['HTTPS certificate managed by Render', 'Deploys are triggered by the pipeline through the Render API', 'Also runs locally on Docker or Kubernetes'], files: ['README.md'] },
  { icon: 'link', title: 'Public link', text: 'The store you are using now is the live deployment, reachable by anyone.',
    points: ['Smoke test runs against it after every deploy', 'Footer and sidebar show the deployed commit', 'This page reads the live status every 5 seconds'], files: ['scripts/smoke.sh'] }
];

const STEPS = [
  ['git push', 'Code goes to GitHub', true],
  ['1. Test', 'Unit tests (node --test)'],
  ['2. Security', 'Gitleaks + Trivy'],
  ['3. Build', 'Docker image, scan, push to GHCR'],
  ['4. Kubernetes', 'Deploy to a kind cluster and test'],
  ['5. Deploy', 'Render API, wait until live, test'],
  ['Live', 'This website', true]
];

async function renderDevops(_, stale) {
  view.innerHTML = `
    <header class="page-head"><div><h1>How it's built</h1><p class="muted">The DevOps side of RetailFlow, with the live state of this deployment</p></div>
      <a class="button" href="${REPO}" target="_blank" rel="noopener">${icon('code', 16)} Source on GitHub</a></header>

    <h2>Live status</h2>
    <div class="status-grid" id="live"></div>

    <h2 class="section">Pipeline on every push</h2>
    <div class="pipeline">${STEPS.map(([title, text, edge], i) => `${i ? `<span class="arrow">${icon('arrow', 16)}</span>` : ''}
      <div class="step ${edge ? 'edge' : ''}"><b>${title}</b><span>${text}</span></div>`).join('')}</div>
    <p class="small" style="margin-top:10px"><a href="${REPO}/actions" target="_blank" rel="noopener">See the pipeline runs on GitHub Actions</a></p>

    <h2 class="section">How a request reaches the database</h2>
    <div class="arch">
      <div class="node"><b>Browser</b><small>this website</small></div><span class="arrow">${icon('arrow', 16)}</span>
      <div class="node"><b>HTTPS</b><small>Render, or Caddy locally</small></div><span class="arrow">${icon('arrow', 16)}</span>
      <div class="node"><b>RetailFlow app</b><small>Node.js + Express, Docker image</small></div><span class="arrow">${icon('arrow', 16)}</span>
      <div class="node"><b>PostgreSQL 16</b><small>products, orders, order items</small></div>
    </div>

    <h2 class="section">Each part of the assignment</h2>
    <div class="parts">${PARTS.map(p => `
      <div class="card part">
        <h3>${icon(p.icon)} ${p.title}</h3>
        <p>${p.text}</p>
        <ul>${p.points.map(point => `<li>${esc(point)}</li>`).join('')}</ul>
        <div class="files">${p.files.map(file).join('')}</div>
      </div>`).join('')}</div>

    <h2 class="section">REST API</h2>
    <div class="card table-card">
      <table class="table">
        <thead><tr><th>Method</th><th>Path</th><th>What it does</th></tr></thead>
        <tbody>${[
          ['GET', '/health', 'Health check with database latency'],
          ['GET', '/api/info', 'Deployed version, server, platform and uptime'],
          ['GET', '/api/products', 'Products in the shop'],
          ['POST', '/api/products', 'Add a product (validated)'],
          ['PATCH', '/api/products/:id', 'Change the stock'],
          ['DELETE', '/api/products/:id', 'Remove a product from the shop'],
          ['GET', '/api/orders', 'Latest orders with their items'],
          ['GET', '/api/orders/:id', 'One order'],
          ['POST', '/api/orders', 'Place an order (one transaction)'],
          ['GET', '/api/stats', 'Numbers for the admin page']
        ].map(([method, path, text]) => `<tr><td><span class="method ${method}">${method}</span></td>
          <td class="mono">${method === 'GET' && !path.includes(':') ? `<a href="${path}" target="_blank" rel="noopener">${path}</a>` : path}</td><td>${text}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;

  const drawLive = async () => {
    const { health, info } = await refreshStatus();
    if (stale()) return;
    const up = health?.status === 'UP';
    const version = info?.version || '-';
    document.getElementById('live').innerHTML = `
      <div class="card stat"><small>Status</small><strong><span class="pill ${up ? 'ok' : 'bad'}">${up ? 'Running' : 'Not reachable'}</span></strong></div>
      <div class="card stat"><small>Database</small><strong>${up ? `Connected, ${health.dbMs} ms` : 'Down'}</strong></div>
      <div class="card stat"><small>Deployed commit</small><strong class="mono">${/^[0-9a-f]{7,40}$/.test(version)
        ? `<a href="${REPO}/commit/${version}" target="_blank" rel="noopener">${version.slice(0, 7)}</a>` : esc(version)}</strong></div>
      <div class="card stat"><small>Running on</small><strong>${esc(info?.platform || '-')}</strong></div>
      <div class="card stat"><small>Server / pod</small><strong class="mono">${esc(info?.server || '-')}</strong></div>
      <div class="card stat"><small>Up for</small><strong>${info ? uptime(info.uptimeSeconds) : '-'}</strong></div>`;
  };
  await drawLive();
  if (!stale()) pageTimer = setInterval(drawLive, 5000);
}

renderLog();
router();
