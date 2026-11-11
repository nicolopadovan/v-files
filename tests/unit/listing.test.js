import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseListing } from '../../extension/src/listing.js';

const page = `<script>start("/tmp/x/");</script>
<script>onHasParentDirectory();</script>
<script>addRow("..","..",1,0,"0 B",0,"");</script>
<script>addRow("sub dir","sub%20dir",1,96,"96 B",1793730465,"11/3/26");</script>
<script>addRow("a \\"q\\".md","a%20%22q%22.md",0,5,"5 B",1793730465,"11/3/26");</script>
<script>addRow(broken</script>`;

test('parses Chrome directory listing rows', () => {
  assert.deepEqual(parseListing(page), [
    { name: 'sub dir', href: 'sub%20dir/', isDir: true, size: 0, mtime: 1793730465000 },
    { name: 'a "q".md', href: 'a%20%22q%22.md', isDir: false, size: 5, mtime: 1793730465000 },
  ]);
});
