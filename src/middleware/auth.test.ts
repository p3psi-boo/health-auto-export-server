import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { requireAuth } from "./auth";

describe("auth middleware", () => {
  test("requireAuth allows valid token", async () => {
    const app = new Hono();
    app.get("/test", requireAuth, (c) => {
      const token = c.get("token");
      return c.json({ token });
    });

    const res = await app.request("/test", {
      headers: { "api-key": "sk-test-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe("sk-test-token");
  });

  test("requireAuth rejects missing token", async () => {
    const app = new Hono();
    app.get("/test", requireAuth, (c) => c.text("ok"));

    const res = await app.request("/test");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Unauthorized");
  });

  test("requireAuth rejects token without sk- prefix", async () => {
    const app = new Hono();
    app.get("/test", requireAuth, (c) => c.text("ok"));

    const res = await app.request("/test", {
      headers: { "api-key": "invalid-token" },
    });
    expect(res.status).toBe(401);
  });
});
