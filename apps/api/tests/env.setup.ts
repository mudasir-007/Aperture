// Runs before the test framework is loaded. The actual env values are
// supplied by the "test" npm script (see package.json), which points
// DB_FILE at an isolated SQLite file kept separate from local dev data.
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Tests must be run with NODE_ENV=test (use `npm test`, not `jest` directly).');
}
