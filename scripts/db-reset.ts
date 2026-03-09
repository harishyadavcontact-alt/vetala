import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for db:reset");
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(__dirname, "..", "db", "schema.sql");
  const schemaSql = await readFile(schemaPath, "utf8");

  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query('GRANT ALL ON SCHEMA public TO public');
    await client.query(schemaSql);
    console.log("Database schema reset complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
