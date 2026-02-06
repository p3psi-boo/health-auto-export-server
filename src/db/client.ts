import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

import * as schema from "./schema";

const sql = new SQL(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

export async function runMigrations() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete");
}
