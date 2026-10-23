const rs = n => 'Rs ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function show(text, isError = false) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.className = isError ? 'error' : 'ok';
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}

async function loadProducts() {
  const products = await api('/api/products');
  document.querySelector('#products tbody').innerHTML = products.map(p => `
    <tr>
      <td>${p.name.replace(/</g, '&lt;')}</td><td>${rs(p.price)}</td><td>${p.stock}</td>
      <td><button data-id="${p.id}" ${p.stock < 1 ? 'disabled' : ''}>Buy 1</button></td>
    </tr>`).join('');
}

async function loadOrders() {
  const orders = await api('/api/orders');
  document.querySelector('#orders tbody').innerHTML = orders.length
    ? orders.map(o => `<tr><td>${o.id}</td><td>${o.product.replace(/</g, '&lt;')}</td><td>${o.quantity}</td>
        <td>${rs(o.total)}</td><td>${new Date(o.createdAt).toLocaleString()}</td></tr>`).join('')
    : '<tr><td colspan="5" class="muted">No orders yet</td></tr>';
}

document.querySelector('#products').addEventListener('click', async event => {
  const id = event.target.dataset.id;
  if (!id) return;
  try {
    const order = await api('/api/orders', { method: 'POST', body: JSON.stringify({ productId: Number(id), quantity: 1 }) });
    show(`Order #${order.id} placed`);
    loadProducts(); loadOrders();
  } catch (error) { show(error.message, true); }
});

document.querySelector('#add-product').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api('/api/products', { method: 'POST', body: JSON.stringify({
      name: form.get('name'), price: Number(form.get('price')), stock: Number(form.get('stock')) }) });
    event.target.reset();
    show('Product added');
    loadProducts();
  } catch (error) { show(error.message, true); }
});

api('/api/info').then(info => {
  document.getElementById('version').textContent = info.version.slice(0, 7);
  document.getElementById('server').textContent = info.server;
});
loadProducts();
loadOrders();
