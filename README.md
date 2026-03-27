# Workflow Builder

A visual workflow automation platform. Design, configure, and execute automated workflows with a drag-and-drop canvas, cron scheduling, webhook triggers, and real-time execution monitoring.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui, React Flow |
| Backend | Go, Chi router, Ent ORM |
| Database | PostgreSQL 16 |
| Tooling | Docker Compose, pnpm, Biome, Vitest, Air (hot reload) |

## Quick Start

```bash
# Start everything (frontend, backend, database, pgweb)
make up

# Open the app
open http://localhost:3000
```

That's it. Docker Compose builds and starts all services with hot reload.

## Services

| Service | URL | Description |
|---------|-----|-------------|
| Web | http://localhost:3000 | React frontend |
| API | http://localhost:8080 | Go backend |
| pgweb | http://localhost:8081 | Browser-based database explorer |
| PostgreSQL | localhost:5432 | Database (user: `postgres`, password: `postgres`, db: `workflow`) |

## Authentication

In development, get a JWT token from the dev endpoint:

```bash
curl -s http://localhost:8080/v1/dev/token | jq -r .token
```

The frontend handles this automatically.

## Features

- **Visual Canvas** -- Drag-and-drop workflow builder with auto-layout
- **Step Types** -- Configurable steps with JSON schema validation and output mapping
- **Triggers** -- Manual execution, cron schedules, and webhooks (sync and async)
- **Live Monitoring** -- Real-time execution tracking via WebSocket
- **Secrets** -- Encrypted secret storage for API keys and credentials
- **Expressions** -- Reference step outputs, workflow inputs, and secrets with `{{steps.Name.output.field}}` syntax
- **Notifications** -- In-app alerts for workflow events
- **Concurrency Control** -- Allow, skip, or queue concurrent executions
- **Sticky Notes** -- Annotate your canvas with color-coded notes
- **Active Crons Dashboard** -- View all running cron jobs in one place

## Development

### Prerequisites

- Docker & Docker Compose
- Go 1.25+ (for local backend dev)
- Node.js 22+ and pnpm (for local frontend dev)

### Common Commands

```bash
make up          # Start all services
make down        # Stop all services
make reset       # Stop and wipe database
make logs        # Follow all logs
make logs-api    # Follow API logs
make logs-web    # Follow web logs
make lint        # Lint Go + frontend
make test        # Run Go tests
make generate    # Regenerate Ent ORM code
make db-shell    # Open psql shell
```

### Local Development (without Docker)

```bash
# Terminal 1: Backend
make dev-api

# Terminal 2: Frontend
make dev-web
```

### Frontend Commands

```bash
cd web
pnpm run typecheck   # TypeScript check
pnpm run lint        # Biome lint
npx vitest run       # Run tests
```

### Rebuild a Single Service

```bash
docker compose up -d --build --renew-anon-volumes web   # Rebuild frontend
docker compose up -d --build api                         # Rebuild backend
```

## Environment Variables

Set in `docker-compose.yml` for development. For production, configure:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API port | `8080` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@db:5432/workflow?sslmode=disable` |
| `JWT_SECRET` | JWT signing key | `dev-secret-change-me` |
| `SECRET_ENCRYPTION_KEY` | Encryption key for stored secrets | `dev-encryption-key-change-me` |

## Project Structure

```
.
├── cmd/server/         # Go entrypoint
├── ent/                # Ent ORM schema and generated code
├── internal/           # Go packages (workflow, trigger, engine, etc.)
├── web/                # React frontend
│   └── src/
│       ├── api/        # API client
│       ├── app/        # Router and providers
│       ├── components/ # Shared UI components
│       ├── features/   # Feature modules (workflows, secrets, dashboard, auth)
│       ├── hooks/      # Shared hooks
│       └── types/      # TypeScript types
├── docker-compose.yml
├── Makefile
└── CLAUDE.md           # AI assistant instructions
```
