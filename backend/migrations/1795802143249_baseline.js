// Baseline: the schema as it stood when migrations were introduced.
// It runs db/schema.sql unchanged, so that file must not be edited.
// A database that already has this schema must be marked as migrated
// instead of running this file; see db/README.md.
const fs = require('node:fs');
const path = require('node:path');

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

const up = (pgm) => {
  pgm.sql(schemaSql);
};

// Reverting the baseline would drop every table and its data.
const down = false;

module.exports = {
  up,
  down,
};
