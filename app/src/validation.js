// Input checks, kept separate so they can be unit-tested without a database.

export function validateProduct({ name, category, price, stock, description } = {}) {
  const errors = [];
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 60) errors.push('Name must be 2 to 60 characters');
  if (category !== undefined && (typeof category !== 'string' || category.length > 30)) errors.push('Category must be at most 30 characters');
  if (description !== undefined && (typeof description !== 'string' || description.length > 200)) errors.push('Description must be at most 200 characters');
  if (typeof price !== 'number' || !(price >= 0) || price > 10000000) errors.push('Price must be 0 or more');
  if (!Number.isInteger(stock) || stock < 0) errors.push('Stock must be a whole number, 0 or more');
  return errors;
}

export function validateStock({ stock } = {}) {
  return Number.isInteger(stock) && stock >= 0 ? [] : ['Stock must be a whole number, 0 or more'];
}

// An order is { customer, items: [{ productId, quantity }] }. The short form
// { productId, quantity } (one product) is accepted too. Returns the cleaned
// order, with the same product merged into one line.
export function parseOrder(body = {}) {
  const errors = [];
  const customer = typeof body.customer === 'string' && body.customer.trim() ? body.customer.trim() : 'Guest';
  if (customer.length > 60) errors.push('Name must be at most 60 characters');
  const lines = Array.isArray(body.items) ? body.items : [{ productId: body.productId, quantity: body.quantity }];
  if (lines.length === 0 || lines.length > 20) errors.push('An order needs 1 to 20 products');
  const merged = new Map();
  for (const { productId, quantity } of lines) {
    if (!Number.isInteger(productId)) { errors.push('Choose a product'); break; }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) { errors.push('Quantity must be 1 to 100'); break; }
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  // Sorted by product id so concurrent orders lock rows in the same order (no deadlocks).
  const items = [...merged].sort(([a], [b]) => a - b).map(([productId, quantity]) => ({ productId, quantity }));
  return { errors, customer, items };
}
