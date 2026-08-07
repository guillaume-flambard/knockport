// Global test setup. Web tests run against an in-memory SQLite database: the
// db module reads KNOCKPORT_DB once on its first getDb() call, so the value
// must be present before any test imports it.
process.env.KNOCKPORT_DB = ':memory:'
