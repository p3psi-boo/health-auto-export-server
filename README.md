# Health Auto Export Server

用于接收和存储 iOS [Health Auto Export](https://www.healthexportapp.com/) 应用数据的自托管服务器。

**技术栈:** Bun + Hono + Drizzle ORM + PostgreSQL

## 用法

### 环境变量

```bash
PORT=3000                                                    # 可选，默认 3000
DATABASE_URL=postgresql://user:pass@localhost:5432/health    # 必需
```

### API 认证

所有 API 请求需通过 `api-key` 请求头携带令牌，令牌必须以 `sk-` 开头：

```bash
curl -H "api-key: sk-your-token" http://localhost:3000/api/metrics/heart_rate
```

令牌同时作为多租户标识符，数据按令牌隔离。

### REST API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/data` | POST | 写入 metrics 和 workouts 数据 |
| `/api/metrics/:name` | GET | 按名称查询 metrics（支持 `from`、`to` 参数） |
| `/api/workouts` | GET | 列出 workouts（支持 `startDate`、`endDate` 参数） |
| `/api/workouts/:id` | GET | 获取单个 workout 详情 |

#### 写入数据示例

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

#### 查询参数

- `from` / `to` / `startDate` / `endDate`: 支持 Unix 毫秒时间戳、`YYYY-MM-DD`、`YYYY-MM-DD HH:MM:SS`
- `include` / `exclude`: 逗号分隔的字段名，用于过滤返回字段

### MCP Server

服务器在 `/mcp` 提供 Model Context Protocol (Streamable HTTP) 端点。

**客户端配置:**

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

**可用工具:**

| 工具 | 描述 |
|------|------|
| `list_metric_names` | 列出所有 metric 名称 |
| `query_metrics` | 按名称和日期范围查询 metrics |
| `get_metric_stats` | 获取指定 metric 的统计信息 |
| `list_workouts` | 列出 workouts |
| `get_workout_detail` | 获取 workout 详情（含心率、路线） |
| `get_workout_types` | 列出所有 workout 类型 |

### Docker 部署

```bash
docker build -t health-auto-export-server .
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/health \
  health-auto-export-server
```

---

## 开发

### 环境准备

```bash
bun install
cp .env.example .env  # 编辑 .env 配置数据库连接
```

### 数据库迁移

```bash
bun run db:generate   # 从 schema 生成迁移文件
bun run db:migrate    # 应用迁移
bun run db:studio     # 打开 Drizzle Studio
```

### 启动开发服务器

```bash
bun run dev           # 热重载开发模式
bun run start         # 生产模式
```

### 项目结构

```
├── src/
│   ├── db/           # 数据库 schema 和连接
│   ├── routes/       # API 路由
│   └── mcp/          # MCP 工具定义
├── drizzle/          # 迁移文件
├── index.ts          # 入口文件
└── drizzle.config.ts # Drizzle 配置
```
