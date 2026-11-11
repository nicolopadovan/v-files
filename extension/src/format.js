const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatSize(bytes) {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unit]}`;
}

export const formatDate = (ms) => dateFormat.format(ms);

const countFormat = new Intl.NumberFormat('en-US');

export const formatCharacters = (text) => {
  const count = [...text].length;
  return `${countFormat.format(count)} ${count === 1 ? 'character' : 'characters'}`;
};
