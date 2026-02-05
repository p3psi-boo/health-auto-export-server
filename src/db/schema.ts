import {
  pgTable,
  bigserial,
  text,
  timestamp,
  jsonb,
  integer,
  doublePrecision,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const metrics = pgTable(
  "metrics",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    token: text("token").notNull(),
    name: text("name").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
    units: text("units"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("metrics_token_name_date_source_uniq").on(table.token, table.name, table.date, table.source),
    index("metrics_token_name_date_idx").on(table.token, table.name, table.date),
  ]
);

export const workouts = pgTable(
  "workouts",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    workoutType: text("workout_type").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    activeEnergyBurned: doublePrecision("active_energy_burned"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workouts_token_start_time_idx").on(table.token, table.startTime),
  ]
);
