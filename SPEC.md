# SPEC

This document specifies the Bun + Hono + Drizzle + Bun.sql (Postgres) server.
The HTTP contract is based on `refs/offical-ref` (official reference), but the
storage backend is PostgreSQL instead of MongoDB.

## Goals

- Provide the same API surface and auth semantics as `refs/offical-ref`.
- Use PostgreSQL as the primary database.
- Use Bun's native Postgres client (`Bun.sql` / `SQL` from `bun`) as the Drizzle driver.
- Keep the ingestion format lossless by storing the original payloads.

## Non-goals

- Exact one-to-one MongoDB document structure.
- Optimizing analytics queries for Grafana beyond basic indexing.
  (We will store `payload` as JSONB first; we can normalize later if needed.)

## Stack

- Runtime: Bun
- HTTP: Hono
- ORM: Drizzle ORM
- DB: PostgreSQL
- DB Driver: `drizzle-orm/bun-sql` (Bun.sql)
- Migrations: drizzle-kit

## Configuration

Environment variables (required unless noted):

- `PORT` (optional, default `3000`)
- `DATABASE_URL` (required)
  - Example: `postgresql://user:pass@localhost:5432/health_auto_export`

## Authentication (Multi-tenant)

Simple token-based multi-tenancy. The token itself serves as the tenant identifier.

- Header: `api-key: sk-...`
- Tokens MUST start with `sk-`
- A single token is used for both read/write and MCP
- Data is isolated by token (stored directly in metrics/workouts tables)
- If missing/invalid:
  - status `401`
  - JSON `{ "error": "Unauthorized: ..." }`

## Request/Response Models

### Ingest body

`POST /api/data` consumes:

```json
{
  "data": {
    "metrics": [
      {
        "name": "heart_rate",
        "units": "count/min",
        "data": []
      }
    ],
    "workouts": [
      {
        "id": "...",
        "name": "Running",
        "start": 1700000000000,
        "end": 1700003600000,
        "duration": 3600
      }
    ]
  }
}
```

The server stores the payload losslessly in JSONB columns.

### Ingest response

Response is a merged object:

```json
{
  "metrics": { "success": true, "message": "..." },
  "workouts": { "success": true, "message": "..." }
}
```

Status codes:

- `200` if all requested sub-writes succeed
- `207` if some succeed and some fail
- `500` if all requested sub-writes fail

## Date parsing (query parameters)

Endpoints accept a flexible date format for `from/to/startDate/endDate`.

Accepted inputs:

- Unix timestamp in milliseconds (numeric string)
- `YYYY-MM-DD`
- `YYYY/MM/DD`
- `YYYY-MM-DD HH:MM:SS`

Normalization rules:

- Numeric input is treated as epoch milliseconds.
- Date-only input is treated as `00:00:00Z`.
- Date-time without timezone is treated as UTC.

If parsing fails, respond `400` with `{ "error": "invalid date" }`.

## Field filtering: include/exclude

The official reference supports top-level field filtering via `include` and
`exclude` query parameters (comma-separated field names).

Rules:

- If `include` is present, return ONLY those keys.
- Else if `exclude` is present, drop those keys.
- If both are provided, `include` takes precedence.
- Filtering is shallow (top-level only).

## PostgreSQL Schema

All timestamps are stored as `timestamptz` (Goal 1.A).

### Table: metrics

Purpose: store all Health metrics in a single table, keyed by metric name.

Columns:

- `id` bigserial primary key
- `token` text not null (tenant identifier)
- `name` text not null
- `date` timestamptz not null
- `source` text not null
- `units` text null
- `payload` jsonb not null
- `created_at` timestamptz not null default now()

Constraints / indexes:

- Unique: `(token, name, date, source)`
- Index: `(token, name, date)` for range queries

Rationale:

- `payload` keeps ingestion lossless and avoids over-modeling 100+ metric types.
- Unique constraint prevents duplicated points for the same token/source/time.

### Table: workouts

Purpose: store workouts, plus payload for detailed data.

Columns:

- `id` text primary key (Apple workout id)
- `token` text not null (tenant identifier)
- `workout_type` text not null
- `start_time` timestamptz not null
- `end_time` timestamptz not null
- `duration_seconds` integer not null
- `active_energy_burned` double precision null
- `payload` jsonb not null
- `created_at` timestamptz not null default now()

Indexes:

- Index: `(token, start_time desc)` for list endpoint

Rationale:

- List endpoint needs a few derived fields; store core columns for easy sorting.
- Detail endpoint reads structured arrays from `payload`.

## HTTP API

Base path: `/api`

### POST /api/data (write)

Auth: `WRITE_TOKEN`

Behavior:

- Parses JSON body as `{ data: { metrics?: [], workouts?: [] } }`.
- Writes metrics and workouts independently (can run in parallel).
- Returns merged `IngestResponse`.

Error handling:

- Invalid JSON or missing `data`: `400`
- DB errors: reflected in `IngestResponse`, status chosen by success matrix.

Body size:

- Enforce a max size (target: 200MB) for this endpoint.
- Prefer checking `content-length` and rejecting with `413` when exceeded.

### GET /api/metrics/:selected_metric (read)

Auth: `READ_TOKEN`

Query:

- `from` (optional)
- `to` (optional)
- `include` (optional)
- `exclude` (optional)

Response shape (Goal 2.B):

- Returns an array of objects that mirror the stored metric row (not just payload).
- Recommended base object:

```json
{
  "name": "heart_rate",
  "date": "2026-02-05T00:00:00.000Z",
  "source": "Apple Health",
  "units": "count/min",
  "payload": { "Avg": 70, "Min": 55, "Max": 120 }
}
```

Then apply include/exclude filtering.

### GET /api/workouts (read)

Auth: `READ_TOKEN`

Query:

- `startDate` (optional)
- `endDate` (optional)
- `include` (optional)
- `exclude` (optional)

Response:

- Returns an array sorted by `start_time desc`.
- Each item follows the official mapping:

```json
{
  "id": "...",
  "workout_type": "Running",
  "start_time": "2026-02-05T00:00:00.000Z",
  "end_time": "2026-02-05T01:00:00.000Z",
  "duration_minutes": 60,
  "calories_burned": 420
}
```

Then apply include/exclude filtering.

### GET /api/workouts/:id (read)

Auth: `READ_TOKEN`

Query:

- `include` (optional)
- `exclude` (optional)

Response:

```json
{
  "heartRateData": [
    { "type": "heart_rate", "timestamp": "...", "value": 120 }
  ],
  "heartRateRecovery": [],
  "route": [
    { "latitude": 1.0, "longitude": 2.0, "time": "..." }
  ]
}
```

- If workout not found: `404` `{ "error": "not found" }`

### GET /api/workouts/health (read)

Auth: `READ_TOKEN`

- Returns text `OK` with status `200`.

## Migrations

Commands (bun):

- Generate migration: `bun run db:generate`
- Apply migration: `bun run db:migrate`
- Studio: `bun run db:studio`

`drizzle.config.ts` uses `dialect: "postgresql"` and `dbCredentials.url`.
