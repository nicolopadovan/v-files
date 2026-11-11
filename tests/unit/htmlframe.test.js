import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withBase } from '../../extension/src/htmlframe.js';

const base = '<base href="file:///r/a.html">';

test('puts the base inside head, never before the doctype', () => {
  assert.equal(withBase('<!doctype html><html><head><title>x</title>', 'file:///r/a.html'), `<!doctype html><html><head>${base}<title>x</title>`);
  assert.equal(withBase('<!DOCTYPE html><header>x</header>', 'file:///r/a.html'), `<!DOCTYPE html>${base}<header>x</header>`);
  assert.equal(withBase('<p>bare</p>', 'file:///r/a.html'), `${base}<p>bare</p>`);
});
