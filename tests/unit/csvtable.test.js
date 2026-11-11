import assert from 'node:assert/strict';
import { test } from 'node:test';
import { numericColumns, parseNumber, sortRows } from '../../extension/src/csvtable.js';

test('parses numbers in either decimal convention', () => {
  assert.equal(parseNumber('1.234,5', ','), 1234.5);
  assert.equal(parseNumber('1,234.5', '.'), 1234.5);
  assert.equal(parseNumber(' 12 % ', '.'), 12);
  assert.equal(parseNumber('€ -3,50', ','), -3.5);
  assert.ok(Number.isNaN(parseNumber('2026-11-04', '.')));
  assert.ok(Number.isNaN(parseNumber('abc', '.')));
});

test('finds numeric columns, ignoring blanks', () => {
  assert.deepEqual(numericColumns([['a', '1'], ['b', ''], ['c', '2,5']], 2, ','), [false, true]);
  assert.deepEqual(numericColumns([['', '']], 2, '.'), [false, false]);
});

test('sorts numerically or naturally, and keeps file order when unsorted', () => {
  const rows = [['b', '10'], ['a10', '9'], ['a2', '100']];
  assert.deepEqual(sortRows(rows, { column: 1, direction: 'asc', numeric: true, decimal: '.' }).map((r) => r[1]), ['9', '10', '100']);
  assert.deepEqual(sortRows(rows, { column: 0, direction: 'desc', numeric: false, decimal: '.' }).map((r) => r[0]), ['b', 'a10', 'a2']);
  assert.equal(sortRows(rows, { column: 0, direction: 'none' }), rows);
});
