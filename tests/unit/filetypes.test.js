import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kindOf } from '../../extension/src/filetypes.js';
import { formatCharacters, formatSize } from '../../extension/src/format.js';

test('classifies files by extension', () => {
  assert.equal(kindOf('notes.MD'), 'markdown');
  assert.equal(kindOf('photo.jpeg'), 'image');
  assert.equal(kindOf('report.pdf'), 'pdf');
  assert.equal(kindOf('Makefile'), 'text');
  assert.equal(kindOf('.env'), 'text');
  assert.equal(kindOf('deck.pptx'), 'document');
  assert.equal(kindOf('data.TSV'), 'csv');
});

test('formats sizes', () => {
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(1500), '1.5 KB');
  assert.equal(formatSize(29689), '30 KB');
});

test('counts characters with spaces', () => {
  assert.equal(formatCharacters(''), '0 characters');
  assert.equal(formatCharacters('à'), '1 character');
  assert.equal(formatCharacters('Ciao mondo 👋'), '12 characters');
  assert.equal(formatCharacters('x'.repeat(1234)), '1,234 characters');
});
