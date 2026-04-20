import "dotenv/config";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

const r1 = await client.query(
  "select current_database() as db, current_user as usr, inet_server_addr()::text as host, inet_server_port() as port"
);
console.log("NODE/PRISMA URL ->");
console.log(r1.rows);

const r2 = await client.query(
  "select schema_name from information_schema.schemata where schema_name in ('platform','identity','patients','crm','scheduling','clinical') order by schema_name"
);
console.log("NODE/PRISMA schemas ->");
console.log(r2.rows);

await client.end();
