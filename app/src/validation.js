// Input checks, kept separate so they can be unit-tested without a database.

export function validateProduct({ name, price, stock }) {
  const errors = [];
  if (typeof name !== 'string' || name.trim().length < 2) errors.push('Name must be at least 2 characters');
  if (typeof price !== 'number' || !(price >= 0)) errors.push('Price must be 0 or more');
  if (!Number.isInteger(stock) || stock < 0) errors.push('Stock must be a whole number, 0 or more');
  return errors;
}

export function validateOrder({ productId, quantity }) {
  const errors = [];
  if (!Number.isInteger(productId)) errors.push('Choose a product');
  if (!Number.isInteger(quantity) || quantity < 1) errors.push('Quantity must be at least 1');
  return errors;
}
