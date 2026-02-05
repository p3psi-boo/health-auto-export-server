# Health Auto Export Server

Self-hosted server for receiving and storing iOS [Health Auto Export](https://www.healthexportapp.com/) app data.

**Tech Stack:** Bun + Hono + Drizzle ORM + PostgreSQL

## Usage

### Environment Variables

```bash
PORT=3000                                                    # Optional, default 3000
DATABASE_URL=postgresql://user:pass@localhost:5432/health    # Required
```

### API Authentication

All API requests require the `api-key` header with a token starting with `sk-`:

```bash
curl -H "api-key: sk-your-token" http://localhost:3000/api/metrics/heart_rate
```

The token also serves as a multi-tenant identifier; data is isolated by token.

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/data` | POST | Write metrics and workouts data |
| `/api/metrics/:name` | GET | Query metrics by name (supports `from`, `to` params) |
| `/api/workouts` | GET | List workouts (supports `startDate`, `endDate` params) |
| `/api/workouts/:id` | GET | Get single workout detail |

#### Write Data Example

```bash
curl -X POST http://localhost:3000/api/data \
  -H "api-key: sk-your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "metrics": [{"name": "heart_rate", "units": "count/min", "data": [...]}],
      "workouts": [{"id": "...", "name": "Running", "start": 1700000000000, "end": 1700003600000}]
    }
  }'
```

#### Query Parameters

- `from` / `to` / `startDate` / `endDate`: Supports Unix milliseconds timestamp, `YYYY-MM-DD`, `YYYY-MM-DD HH:MM:SS`
- `include` / `exclude`: Comma-separated field names to filter response fields

### MCP Server

The server provides a Model Context Protocol (Streamable HTTP) endpoint at `/mcp`.

**Client Configuration:**

```json
{
  "mcpServers": {
    "health-data": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "api-key": "sk-your-token"
      }
    }
  }
}
```

**Available Tools:**

| Tool | Description |
|------|-------------|
| `list_metric_names` | List all metric names |
| `query_metrics` | Query metrics by name and date range |
| `get_metric_stats` | Get statistics for a specific metric |
| `list_workouts` | List workouts |
| `get_workout_detail` | Get workout details (including heart rate, route) |
| `get_workout_types` | List all workout types |

### Docker Deployment

```bash
docker build -t health-auto-export-server .
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/health \
  health-auto-export-server
```

---

## Development

### Setup

```bash
bun install
cp .env.example .env  # Edit .env to configure database connection
```

### Database Migration

```bash
bun run db:generate   # Generate migrations from schema
bun run db:migrate    # Apply migrations
bun run db:studio     # Open Drizzle Studio
```

### Start Development Server

```bash
bun run dev           # Development mode with hot reload
bun run start         # Production mode
```

### Project Structure

```
├── src/
│   ├── db/           # Database schema and connection
│   ├── routes/       # API routes
│   └── mcp/          # MCP tool definitions
├── drizzle/          # Migration files
├── index.ts          # Entry point
└── drizzle.config.ts # Drizzle configuration
```
