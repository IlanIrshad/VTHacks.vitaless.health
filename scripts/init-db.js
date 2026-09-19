// One-time DB setup: applies db/schema.sql against DATABASE_URL.
// Usage: npm run db:init

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in first.");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  // See the comment on withLibpqSslCompat in src/lib/db.ts: passing `ssl`
  // as a separate Pool option is silently overwritten by the connection
  // string's own parsed ssl, so the compat flag has to live in the string.
  const connectionString = /[?&]uselibpqcompat=/.test(process.env.DATABASE_URL)
    ? process.env.DATABASE_URL
    : `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes("?") ? "&" : "?"}uselibpqcompat=true`;
  const pool = new Pool({ connectionString });
  try {
    await pool.query(schema);
    console.log("Schema applied successfully to", process.env.DATABASE_URL.replace(/:[^:@]+@/, ":****@"));
  } catch (err) {
    console.error("Failed to apply schema:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
