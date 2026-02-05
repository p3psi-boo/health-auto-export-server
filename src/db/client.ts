import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import * as schema from "./schema";

const sql = new SQL(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
