import { h } from './dom.js';

export const MAX_ROWS = 5000;
const SORT_CYCLE = { none: 'asc', asc: 'desc', desc: 'none' };
const ARIA_SORT = { none: null, asc: 'ascending', desc: 'descending' };

export function parseNumber(text, decimal) {
  const thousands = decimal === ',' ? '.' : ',';
  const plain = text.trim().replace(/[\s%€$£]/g, '').replaceAll(thousands, '').replace(decimal, '.');
  return /^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(plain) ? Number(plain) : NaN;
}

export function numericColumns(rows, columnCount, decimal) {
  return Array.from({ length: columnCount }, (_, column) => {
    const values = rows.map((row) => row[column] ?? '').filter((value) => value.trim() !== '');
    return values.length > 0 && values.every((value) => !Number.isNaN(parseNumber(value, decimal)));
  });
}

export function sortRows(rows, { column, direction, numeric, decimal, cell = (row) => row }) {
  if (direction === 'none') return rows;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const key = (row) => cell(row)[column] ?? '';
  const compare = numeric
    ? (a, b) => (parseNumber(key(a), decimal) || 0) - (parseNumber(key(b), decimal) || 0)
    : (a, b) => collator.compare(key(a), key(b));
  const sign = direction === 'asc' ? 1 : -1;
  return rows.toSorted((a, b) => sign * compare(a, b));
}

const MIN_WIDTH = 48;
const MAX_INITIAL_WIDTH = 480;
const MAX_FIT_WIDTH = 800;
const MIN_HEIGHT = 22;
const CELL_PADDING = 24;
const HEADER_EXTRA = 18;
const MEASURE_SAMPLE = 500;

const layouts = new Map();

function textMeasurer() {
  const context = document.createElement('canvas').getContext('2d');
  const family = getComputedStyle(document.body).fontFamily;
  return (text, weight = 400) => {
    context.font = `${weight} 13px ${family}`;
    return Math.max(...String(text).split('\n').map((line) => context.measureText(line).width));
  };
}

function fitWidth(measure, header, rows, column, cap) {
  const widest = Math.max(measure(header ?? '', 600) + HEADER_EXTRA, ...rows.map((row) => measure(row[column] ?? '')));
  return Math.round(Math.min(cap, Math.max(MIN_WIDTH, widest + CELL_PADDING)));
}

function drag(event, onMove) {
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  handle.setPointerCapture(event.pointerId);
  const origin = { x: event.clientX, y: event.clientY };
  const move = (e) => onMove(e.clientX - origin.x, e.clientY - origin.y);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('lostpointercapture', () => handle.removeEventListener('pointermove', move), { once: true });
}

export function csvTable(rows, delimiter, key) {
  const decimal = delimiter === ';' ? ',' : '.';
  const [header = [], ...body] = rows;
  const columnCount = Math.max(header.length, ...body.map((row) => row.length));
  const numeric = numericColumns(body, columnCount, decimal);
  const measure = textMeasurer();
  const sample = body.slice(0, MEASURE_SAMPLE);
  const saved = layouts.get(key);
  const layout =
    saved?.widths.length === columnCount
      ? saved
      : {
          sort: { column: -1, direction: 'none' },
          widths: Array.from({ length: columnCount }, (_, column) => fitWidth(measure, header[column], sample, column, MAX_INITIAL_WIDTH)),
          heights: new Map(),
        };
  layouts.set(key, layout);
  const cellClass = (column) => (numeric[column] ? 'num' : null);

  const cols = layout.widths.map(() => h('col'));
  const gutterCol = h('col', { class: 'gutter' });
  const table = h('table', { class: 'grid' });
  const tbody = h('tbody');
  const note = h('p', { class: 'notice' });

  function applyWidths() {
    cols.forEach((col, column) => (col.style.width = `${layout.widths[column]}px`));
    const gutter = Math.ceil(measure(String(body.length))) + CELL_PADDING;
    gutterCol.style.width = `${gutter}px`;
    table.style.width = `${gutter + layout.widths.reduce((sum, width) => sum + width, 0)}px`;
  }

  function setWidth(column, width) {
    layout.widths[column] = Math.max(MIN_WIDTH, Math.round(width));
    applyWidths();
  }

  function applyHeight(tr, index) {
    const height = layout.heights.get(index);
    tr.classList.toggle('sized', height != null);
    if (height == null) tr.style.removeProperty('--row-height');
    else tr.style.setProperty('--row-height', `${height}px`);
  }

  const headCells = Array.from({ length: columnCount }, (_, column) =>
    h(
      'th',
      { class: cellClass(column), title: 'Sort', onClick: () => sortBy(column) },
      h('div', { class: 'cell' }, header[column] ?? ''),
      h('span', {
        class: 'col-resize',
        title: 'Drag to resize, double-click to fit',
        onClick: (e) => e.stopPropagation(),
        onDblclick: (e) => {
          e.stopPropagation();
          setWidth(column, fitWidth(measure, header[column], body.slice(0, MAX_ROWS), column, MAX_FIT_WIDTH));
        },
        onPointerdown: (e) => {
          const start = layout.widths[column];
          drag(e, (dx) => setWidth(column, start + dx));
        },
      }),
    ),
  );

  function bodyRow(row, index) {
    const tr = h(
      'tr',
      {},
      h(
        'td',
        { class: 'gutter' },
        String(index + 1),
        h('span', {
          class: 'row-resize',
          title: 'Drag to resize, double-click to reset',
          onDblclick: () => {
            layout.heights.delete(index);
            applyHeight(tr, index);
          },
          onPointerdown: (e) => {
            const start = tr.getBoundingClientRect().height;
            drag(e, (_dx, dy) => {
              layout.heights.set(index, Math.max(MIN_HEIGHT, Math.round(start + dy)));
              applyHeight(tr, index);
            });
          },
        }),
      ),
      Array.from({ length: columnCount }, (_, column) => h('td', { class: cellClass(column) }, h('div', { class: 'cell' }, row[column] ?? ''))),
    );
    applyHeight(tr, index);
    return tr;
  }

  function render() {
    const { sort } = layout;
    const indexed = body.map((row, index) => ({ row, index }));
    const sorted = sortRows(indexed, { ...sort, numeric: numeric[sort.column], decimal, cell: (entry) => entry.row });
    tbody.replaceChildren(...sorted.slice(0, MAX_ROWS).map(({ row, index }) => bodyRow(row, index)));
    headCells.forEach((cell, column) => {
      const state = column === sort.column ? sort.direction : 'none';
      if (ARIA_SORT[state]) cell.setAttribute('aria-sort', ARIA_SORT[state]);
      else cell.removeAttribute('aria-sort');
    });
    note.textContent = body.length > MAX_ROWS ? `Showing ${MAX_ROWS.toLocaleString()} of ${body.length.toLocaleString()} rows` : '';
    note.hidden = body.length <= MAX_ROWS;
  }

  function sortBy(column) {
    const { sort } = layout;
    sort.direction = column === sort.column ? SORT_CYCLE[sort.direction] : 'asc';
    sort.column = column;
    render();
  }

  table.append(h('colgroup', {}, gutterCol, cols), h('thead', {}, h('tr', {}, h('th', { class: 'gutter' }), headCells)), tbody);
  applyWidths();
  render();
  return h('div', { class: 'csv' }, note, table);
}
