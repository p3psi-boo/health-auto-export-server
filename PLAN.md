# PLAN

Checklist for migrating the current repo to Bun.sql + Postgres, and implementing
the official-ref HTTP contract.

## Setup

- [ ] Add `.env.example` entries: `DATABASE_URL`, `READ_TOKEN`, `WRITE_TOKEN`
- [ ] Update README to reflect Postgres + Bun.sql (remove SQLite wording)
- [ ] Provide a local Postgres option (docker compose or documented command)

## Drizzle / Database

- [ ] Update `drizzle.config.ts`:
  - [ ] `dialect: "postgresql"`
  - [ ] `dbCredentials: { url: process.env.DATABASE_URL }`
- [ ] Replace `src/db/client.ts`:
  - [ ] Switch from `drizzle-orm/bun-sqlite` to `drizzle-orm/bun-sql`
  - [ ] Initialize Drizzle using `DATABASE_URL`
- [ ] Replace `src/db/schema.ts`:
  - [ ] Switch from `sqlite-core` to `pg-core`
  - [ ] Create `metrics` table (unique `(name, date, source)`)
  - [ ] Create `workouts` table (id pk, start_time index)
- [ ] Generate migrations: `bun run db:generate`
- [ ] Apply migrations: `bun run db:migrate`

## HTTP / Hono

- [ ] Remove or deprecate sample `/users` endpoints
- [ ] Add auth middleware:
  - [ ] `requireReadAuth` checks `api-key` == `READ_TOKEN` and `sk-` prefix
  - [ ] `requireWriteAuth` checks `api-key` == `WRITE_TOKEN` and `sk-` prefix
- [ ] Add utils:
  - [ ] `parseDate()` supports unix ms + `YYYY-MM-DD` + `YYYY/MM/DD` + `YYYY-MM-DD HH:MM:SS`
  - [ ] `filterFields()` implements include/exclude shallow filtering
- [ ] Implement routes:
  - [ ] `POST /api/data` (write)
    - [ ] Validate JSON shape `{ data: ... }`
    - [ ] Save metrics/workouts independently; compute status 200/207/500
    - [ ] Enforce max body size (target 200MB) using `content-length` checks
  - [ ] `GET /api/metrics/:selected_metric` (read)
    - [ ] Optional `from/to` range query
    - [ ] Return row-shaped objects + field filtering (SPEC Goal 2.B)
  - [ ] `GET /api/workouts` (read)
    - [ ] Optional date range (`startDate/endDate`)
    - [ ] Return mapped list object + field filtering
  - [ ] `GET /api/workouts/:id` (read)
    - [ ] 404 if not found
    - [ ] Return detail object extracted from payload
  - [ ] `GET /api/workouts/health` (read)
    - [ ] Return `OK`

## Testing

- [ ] Unit tests (bun test):
  - [ ] `parseDate()` valid/invalid cases
  - [ ] `filterFields()` include/exclude precedence
  - [ ] auth middleware success/fail
- [ ] Integration smoke test (optional but recommended):
  - [ ] Start local Postgres
  - [ ] Run migrations
  - [ ] Ingest a small payload via `POST /api/data`
  - [ ] Validate reads via `/api/metrics/...` and `/api/workouts`

## Delivery

- [ ] Run dev server: `bun run dev`
- [ ] Provide curl examples for:
  - [ ] `/api/data` with `WRITE_TOKEN`
  - [ ] `/api/metrics/:selected_metric` with `READ_TOKEN`
  - [ ] `/api/workouts` with `READ_TOKEN`
