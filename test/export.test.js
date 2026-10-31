const { test, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Work on a temp copy of the data so data/expenses.json is never touched.
// Must be set before the app (and store) is loaded.
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'export-')), 'expenses.json');
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'expenses.json'), 'utf8'));
rows.push(
  { id: 'x1', date: '2026-11-01', category: 'food', amount: 100, note: 'Dinner, with friends' },
  { id: 'x2', date: '2026-11-02', category: 'food', amount: 50, note: 'He said "hi"' },
  { id: 'x3', date: '2026-11-03', category: 'food', amount: 70, note: 'line1\nline2' }
);
fs.writeFileSync(tmp, JSON.stringify(rows));
process.env.EXPENSES_FILE = tmp;

const app = require('../src/app');
const server = app.listen(0);
after(() => {
  server.close();
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
});

// Raw GET returning status, headers and the body as text
function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ port: server.address().port, path: p }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

const HEADER = 'date,category,amount,note';

test('export returns header + 18 rows for September, sorted by date', async () => {
  const res = await get('/expenses/export.csv?from=2026-09-01&to=2026-09-30');
  assert.strictEqual(res.status, 200);
  const lines = res.body.trimEnd().split('\n');
  assert.strictEqual(lines[0], HEADER);
  assert.strictEqual(lines.length, 19);
  const dates = lines.slice(1).map((l) => l.split(',')[0]);
  assert.deepStrictEqual(dates, [...dates].sort());
});

test('export quotes a note containing a comma', async () => {
  const res = await get('/expenses/export.csv?from=2026-11-01&to=2026-11-01');
  assert.strictEqual(res.body, `${HEADER}\n2026-11-01,food,100,"Dinner, with friends"\n`);
});

test('export doubles inner quotes and quotes newlines', async () => {
  const res = await get('/expenses/export.csv?from=2026-11-02&to=2026-11-03');
  assert.strictEqual(
    res.body,
    `${HEADER}\n2026-11-02,food,50,"He said ""hi"""\n2026-11-03,food,70,"line1\nline2"\n`
  );
});

test('export rejects missing, non-ISO, impossible and reversed dates with 400', async () => {
  const bad = [
    '/expenses/export.csv',
    '/expenses/export.csv?from=2026-09-01',
    '/expenses/export.csv?from=01/09/2026&to=30/09/2026',
    '/expenses/export.csv?from=2026-9-1&to=2026-09-30',
    '/expenses/export.csv?from=2026-13-45&to=2026-09-30',
    '/expenses/export.csv?from=2026-09-30&to=2026-09-01',
  ];
  for (const p of bad) {
    const res = await get(p);
    assert.strictEqual(res.status, 400, p);
    assert.ok(JSON.parse(res.body).error, p);
  }
});

test('export sets Content-Type and Content-Disposition', async () => {
  const res = await get('/expenses/export.csv?from=2026-09-01&to=2026-09-30');
  assert.strictEqual(res.headers['content-type'], 'text/csv; charset=utf-8');
  assert.strictEqual(
    res.headers['content-disposition'],
    'attachment; filename="expenses-2026-09-01-2026-09-30.csv"'
  );
});

test('export of an empty range is 200 with only the header', async () => {
  const res = await get('/expenses/export.csv?from=2020-01-01&to=2020-01-31');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, HEADER + '\n');
});
