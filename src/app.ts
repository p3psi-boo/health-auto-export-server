import { Hono } from "hono";
import { and, eq, gte, lte, desc } from "drizzle-orm";

import { db } from "./db/client";
import { metrics, workouts } from "./db/schema";
import { requireAuth } from "./middleware/auth";
import { parseDate } from "./utils/parseDate";
import { filterFields } from "./utils/filterFields";
import { handleMcpRequest } from "./mcp/transport";

const MAX_BODY_SIZE = 200 * 1024 * 1024;

export const app = new Hono();

app.all("/mcp", async (c) => {
  const response = await handleMcpRequest(c.req.raw);
  return response;
});

app.get("/health", (c) => c.json({ ok: true }));

const api = new Hono();

api.post("/data", requireAuth, async (c) => {
  const token = c.get("token");

  const contentLength = c.req.header("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    return c.json({ error: "Payload too large" }, 413);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!body || typeof body !== "object" || !("data" in body)) {
    return c.json({ error: "Missing data field" }, 400);
  }

  const data = (body as { data: unknown }).data;
  if (!data || typeof data !== "object") {
    return c.json({ error: "Invalid data field" }, 400);
  }

  const { metrics: incomingMetrics, workouts: incomingWorkouts } = data as {
    metrics?: unknown[];
    workouts?: unknown[];
  };

  const results: Record<string, { success: boolean; message: string }> = {};
  let successCount = 0;
  let failCount = 0;

  if (incomingMetrics && Array.isArray(incomingMetrics)) {
    try {
      for (const metric of incomingMetrics) {
        const m = metric as {
          name?: string;
          units?: string;
          data?: Array<{ date?: string | number; source?: string; [key: string]: unknown }>;
        };
        if (!m.name || !Array.isArray(m.data)) continue;

        for (const point of m.data) {
          const dateVal = point.date;
          let parsedDate: Date | null = null;
          if (typeof dateVal === "number") {
            parsedDate = new Date(dateVal);
          } else if (typeof dateVal === "string") {
            parsedDate = parseDate(dateVal) ?? new Date(dateVal);
          }
          if (!parsedDate || Number.isNaN(parsedDate.getTime())) continue;

          const source = point.source ?? "unknown";
          await db
            .insert(metrics)
            .values({
              token,
              name: m.name,
              date: parsedDate,
              source,
              units: m.units ?? null,
              payload: point,
            })
            .onConflictDoUpdate({
              target: [metrics.token, metrics.name, metrics.date, metrics.source],
              set: { payload: point, units: m.units ?? null },
            });
        }
      }
      results.metrics = { success: true, message: "Metrics ingested successfully" };
      successCount++;
    } catch (err) {
      console.error("Metrics insert error:", err);
      results.metrics = {
        success: false,
        message: `Failed query: ${err instanceof Error ? err.message : String(err)}`,
      };
      failCount++;
    }
  }

  if (incomingWorkouts && Array.isArray(incomingWorkouts)) {
    try {
      for (const workout of incomingWorkouts) {
        const w = workout as {
          id?: string;
          name?: string;
          start?: number | string;
          end?: number | string;
          duration?: number;
          activeEnergy?: { qty?: number };
          [key: string]: unknown;
        };
        if (!w.id) continue;

        const startTime =
          typeof w.start === "number" ? new Date(w.start) : parseDate(String(w.start));
        const endTime = typeof w.end === "number" ? new Date(w.end) : parseDate(String(w.end));
        if (!startTime || !endTime) continue;

        const durationSeconds = w.duration ?? Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
        const activeEnergyBurned = w.activeEnergy?.qty ?? null;

        await db
          .insert(workouts)
          .values({
            id: w.id,
            token,
            workoutType: w.name ?? "Unknown",
            startTime,
            endTime,
            durationSeconds,
            activeEnergyBurned,
            payload: w,
          })
          .onConflictDoUpdate({
            target: workouts.id,
            set: {
              workoutType: w.name ?? "Unknown",
              startTime,
              endTime,
              durationSeconds,
              activeEnergyBurned,
              payload: w,
            },
          });
      }
      results.workouts = { success: true, message: "Workouts ingested successfully" };
      successCount++;
    } catch (err) {
      results.workouts = {
        success: false,
        message: err instanceof Error ? err.message : "Unknown error",
      };
      failCount++;
    }
  }

  const totalRequested = (incomingMetrics ? 1 : 0) + (incomingWorkouts ? 1 : 0);
  let status = 200;
  if (totalRequested > 0) {
    if (failCount === totalRequested) status = 500;
    else if (failCount > 0) status = 207;
  }

  return c.json(results, status as 200);
});

api.get("/metrics/:selected_metric", requireAuth, async (c) => {
  const token = c.get("token");
  const selectedMetric = c.req.param("selected_metric");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const include = c.req.query("include");
  const exclude = c.req.query("exclude");

  const fromDate = parseDate(from);
  const toDate = parseDate(to);

  if (from && !fromDate) {
    return c.json({ error: "invalid date" }, 400);
  }
  if (to && !toDate) {
    return c.json({ error: "invalid date" }, 400);
  }

  const conditions = [eq(metrics.token, token), eq(metrics.name, selectedMetric)];
  if (fromDate) conditions.push(gte(metrics.date, fromDate));
  if (toDate) conditions.push(lte(metrics.date, toDate));

  const rows = await db
    .select()
    .from(metrics)
    .where(and(...conditions))
    .orderBy(metrics.date);

  const result = rows.map((row) => {
    const obj = {
      name: row.name,
      date: row.date.toISOString(),
      source: row.source,
      units: row.units,
      payload: row.payload,
    };
    return filterFields(obj, include, exclude);
  });

  return c.json(result);
});

api.get("/workouts/health", requireAuth, (c) => {
  return c.text("OK", 200);
});

api.get("/workouts/:id", requireAuth, async (c) => {
  const token = c.get("token");
  const id = c.req.param("id");
  const include = c.req.query("include");
  const exclude = c.req.query("exclude");

  const rows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.token, token), eq(workouts.id, id)))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return c.json({ error: "not found" }, 404);
  }

  const payload = (row.payload ?? {}) as {
    heartRateData?: unknown[];
    heartRateRecovery?: unknown[];
    route?: unknown[];
    [key: string]: unknown;
  };

  const detail = {
    heartRateData: payload.heartRateData ?? [],
    heartRateRecovery: payload.heartRateRecovery ?? [],
    route: payload.route ?? [],
  };

  return c.json(filterFields(detail, include, exclude));
});

api.get("/workouts", requireAuth, async (c) => {
  const token = c.get("token");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const include = c.req.query("include");
  const exclude = c.req.query("exclude");

  const fromDate = parseDate(startDate);
  const toDate = parseDate(endDate);

  if (startDate && !fromDate) {
    return c.json({ error: "invalid date" }, 400);
  }
  if (endDate && !toDate) {
    return c.json({ error: "invalid date" }, 400);
  }

  const conditions = [eq(workouts.token, token)];
  if (fromDate) conditions.push(gte(workouts.startTime, fromDate));
  if (toDate) conditions.push(lte(workouts.startTime, toDate));

  const rows = await db
    .select()
    .from(workouts)
    .where(and(...conditions))
    .orderBy(desc(workouts.startTime));

  const result = rows.map((row) => {
    const obj = {
      id: row.id,
      workout_type: row.workoutType,
      start_time: row.startTime.toISOString(),
      end_time: row.endTime.toISOString(),
      duration_minutes: Math.round(row.durationSeconds / 60),
      calories_burned: row.activeEnergyBurned,
    };
    return filterFields(obj, include, exclude);
  });

  return c.json(result);
});

app.route("/api", api);
