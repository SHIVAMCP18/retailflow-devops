import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrder, validateProduct, validateStock } from '../src/validation.js';

test('a valid product passes', () => {
  assert.deepEqual(validateProduct({ name: 'Desk lamp', category: 'Home office', price: 899, stock: 15 }), []);
});

test('a bad product is rejected with one message per problem', () => {
  assert.equal(validateProduct({ name: 'x', price: -1, stock: 1.5 }).length, 3);
});

test('stock must be a whole number', () => {
  assert.deepEqual(validateStock({ stock: 4 }), []);
  assert.equal(validateStock({ stock: -2 }).length, 1);
});

test('an order with several products is cleaned and merged', () => {
  const order = parseOrder({ customer: ' Asha ', items: [{ productId: 3, quantity: 1 }, { productId: 1, quantity: 2 }, { productId: 3, quantity: 2 }] });
  assert.deepEqual(order, { errors: [], customer: 'Asha', items: [{ productId: 1, quantity: 2 }, { productId: 3, quantity: 3 }] });
});

test('the one-product form still works and the customer defaults to Guest', () => {
  assert.deepEqual(parseOrder({ productId: 1, quantity: 2 }), { errors: [], customer: 'Guest', items: [{ productId: 1, quantity: 2 }] });
});

test('an order needs a product and a quantity of at least 1', () => {
  assert.equal(parseOrder({ productId: 'a', quantity: 1 }).errors.length, 1);
  assert.equal(parseOrder({ productId: 1, quantity: 0 }).errors.length, 1);
  assert.equal(parseOrder({ items: [] }).errors.length, 1);
});
