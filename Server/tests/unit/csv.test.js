const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, cell } = require('../../src/utils/csv');

test('writes header and rows with CRLF line endings', () => {
  assert.equal(toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }], ['a', 'b']), 'a,b\r\n1,x\r\n2,y\r\n');
});
test('quotes commas, quotes and newlines', () => {
  assert.equal(cell('a,b'), '"a,b"');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell('l1\nl2'), '"l1\nl2"');
});
test('neutralises spreadsheet formula injection but keeps real negative numbers', () => {
  assert.equal(cell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(cell('+1+1'), "'+1+1");
  assert.equal(cell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(cell(-5), '-5');
  assert.equal(cell('-5'), '-5');
});
test('handles null, undefined, dates and empty input', () => {
  assert.equal(cell(null), ''); assert.equal(cell(undefined), '');
  assert.equal(cell(new Date('2026-01-02T03:04:05Z')), '2026-01-02T03:04:05.000Z');
  assert.equal(toCsv([], ['a']), 'a\r\n');
});
