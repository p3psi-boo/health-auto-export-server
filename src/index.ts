import { app } from "./app";
import { runMigrations } from "./db/client";

const port = Number(process.env.PORT ?? 3000);

await runMigrations();

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Listening on http://localhost:${port}`);
