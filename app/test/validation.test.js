import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder, validateProduct } from '../src/validation.js';

test('a valid product passes', () => {
  assert.deepEqual(validateProduct({ name: 'Desk lamp', price: 899, stock: 15 }), []);
});

test('a bad product is rejected with one message per problem', () => {
  assert.equal(validateProduct({ name: 'x', price: -1, stock: 1.5 }).length, 3);
});

test('an order needs a product and a quantity of at least 1', () => {
  assert.deepEqual(validateOrder({ productId: 1, quantity: 2 }), []);
  assert.equal(validateOrder({ productId: 'a', quantity: 0 }).length, 2);
});
