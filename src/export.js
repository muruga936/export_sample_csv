const express = require('express');
const store = require('./store');

// Quote a field only when it holds a comma, double quote or newline; double inner quotes.
function csvField(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Build the router; isValidDate is injected so we share app.js's strict YYYY-MM-DD check.
module.exports = function exportRouter(isValidDate) {
  const router = express.Router();

  // GET /expenses/export.csv?from=YYYY-MM-DD&to=YYYY-MM-DD  (both required, inclusive)
  router.get('/expenses/export.csv', (req, res) => {
    const { from, to } = req.query;

    // Reject missing or non-ISO dates, and reversed ranges
    if (!isValidDate(from) || !isValidDate(to)) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
    }
    if (from > to) {
      return res.status(400).json({ error: 'from must not be later than to' });
    }

    // Filter to the inclusive range and order by date ascending (ISO strings sort correctly)
    const rows = store
      .readAll()
      .filter((r) => r.date >= from && r.date <= to)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Header line plus one line per expense, \n endings; dates written exactly as stored
    const lines = ['date,category,amount,note'].concat(
      rows.map((r) => [r.date, r.category, r.amount, csvField(r.note)].join(','))
    );

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expenses-${from}-${to}.csv"`,
    });
    res.send(lines.join('\n') + '\n');
  });

  return router;
};
