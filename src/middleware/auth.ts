import type { Context, Next } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    token: string;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const apiKey = c.req.header("api-key");
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return c.json({ error: "Unauthorized: invalid or missing api-key" }, 401);
  }

  c.set("token", apiKey);
  await next();
}
