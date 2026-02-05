import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";

import { db } from "../db/client";
import { metrics, workouts } from "../db/schema";

export function createMcpServer(token: string) {
  const server = new McpServer(
    {
      name: "health-data-server",
      version: "1.0.0",
    },
    { capabilities: { logging: {} } }
  );

  server.registerTool(
    "list_metric_names",
    {
      title: "List Metric Names",
      description: "List all available metric names in the database",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .selectDistinct({ name: metrics.name })
        .from(metrics)
        .where(eq(metrics.token, token))
        .orderBy(metrics.name);

      const names = rows.map((r) => r.name);
      return {
        content: [{ type: "text", text: JSON.stringify(names, null, 2) }],
      };
    }
  );

  server.registerTool(
    "query_metrics",
    {
      title: "Query Metrics",
      description: "Query health metrics by name and optional date range",
      inputSchema: {
        metric_name: z.string().describe("The metric name to query (e.g., heart_rate, steps)"),
        from: z.string().optional().describe("Start date in ISO format or YYYY-MM-DD"),
        to: z.string().optional().describe("End date in ISO format or YYYY-MM-DD"),
        limit: z.number().optional().default(100).describe("Maximum number of records to return"),
      },
    },
    async ({ metric_name, from, to, limit }) => {
      const conditions = [eq(metrics.token, token), eq(metrics.name, metric_name)];

      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) {
          conditions.push(gte(metrics.date, fromDate));
        }
      }

      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          conditions.push(lte(metrics.date, toDate));
        }
      }

      const rows = await db
        .select()
        .from(metrics)
        .where(and(...conditions))
        .orderBy(desc(metrics.date))
        .limit(limit ?? 100);

      const result = rows.map((row) => ({
        name: row.name,
        date: row.date.toISOString(),
        source: row.source,
        units: row.units,
        payload: row.payload,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_metric_stats",
    {
      title: "Get Metric Statistics",
      description: "Get statistics (count, date range) for a specific metric",
      inputSchema: {
        metric_name: z.string().describe("The metric name to get stats for"),
      },
    },
    async ({ metric_name }) => {
      const rows = await db
        .select({
          count: sql<number>`count(*)::int`,
          minDate: sql<Date>`min(date)`,
          maxDate: sql<Date>`max(date)`,
        })
        .from(metrics)
        .where(and(eq(metrics.token, token), eq(metrics.name, metric_name)));

      const stats = rows[0];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                metric_name,
                count: stats?.count ?? 0,
                earliest_date: stats?.minDate?.toISOString() ?? null,
                latest_date: stats?.maxDate?.toISOString() ?? null,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "list_workouts",
    {
      title: "List Workouts",
      description: "List workouts with optional date range filter",
      inputSchema: {
        from: z.string().optional().describe("Start date in ISO format or YYYY-MM-DD"),
        to: z.string().optional().describe("End date in ISO format or YYYY-MM-DD"),
        limit: z.number().optional().default(50).describe("Maximum number of records to return"),
      },
    },
    async ({ from, to, limit }) => {
      const conditions = [eq(workouts.token, token)];

      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) {
          conditions.push(gte(workouts.startTime, fromDate));
        }
      }

      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          conditions.push(lte(workouts.startTime, toDate));
        }
      }

      const rows = await db
        .select()
        .from(workouts)
        .where(and(...conditions))
        .orderBy(desc(workouts.startTime))
        .limit(limit ?? 50);

      const result = rows.map((row) => ({
        id: row.id,
        workout_type: row.workoutType,
        start_time: row.startTime.toISOString(),
        end_time: row.endTime.toISOString(),
        duration_minutes: Math.round(row.durationSeconds / 60),
        calories_burned: row.activeEnergyBurned,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_workout_detail",
    {
      title: "Get Workout Detail",
      description: "Get detailed information about a specific workout including heart rate data and route",
      inputSchema: {
        workout_id: z.string().describe("The workout ID to get details for"),
      },
    },
    async ({ workout_id }) => {
      const rows = await db
        .select()
        .from(workouts)
        .where(and(eq(workouts.token, token), eq(workouts.id, workout_id)))
        .limit(1);

      const row = rows[0];
      if (!row) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Workout not found" }) }],
        };
      }

      const payload = (row.payload ?? {}) as {
        heartRateData?: unknown[];
        heartRateRecovery?: unknown[];
        route?: unknown[];
        [key: string]: unknown;
      };

      const detail = {
        id: row.id,
        workout_type: row.workoutType,
        start_time: row.startTime.toISOString(),
        end_time: row.endTime.toISOString(),
        duration_minutes: Math.round(row.durationSeconds / 60),
        calories_burned: row.activeEnergyBurned,
        heart_rate_data: payload.heartRateData ?? [],
        heart_rate_recovery: payload.heartRateRecovery ?? [],
        route: payload.route ?? [],
      };

      return {
        content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_workout_types",
    {
      title: "Get Workout Types",
      description: "List all unique workout types in the database",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .selectDistinct({ workoutType: workouts.workoutType })
        .from(workouts)
        .where(eq(workouts.token, token))
        .orderBy(workouts.workoutType);

      const types = rows.map((r) => r.workoutType);
      return {
        content: [{ type: "text", text: JSON.stringify(types, null, 2) }],
      };
    }
  );

  return server;
}
