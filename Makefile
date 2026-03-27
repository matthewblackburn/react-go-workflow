.PHONY: up down logs build lint generate db-shell

# Start all services with hot reload
up:
	docker compose up --build -d

# Stop all services
down:
	docker compose down

# Stop and remove volumes (reset DB)
reset:
	docker compose down -v

# Follow logs for all services
logs:
	docker compose logs -f

# Follow API logs only
logs-api:
	docker compose logs -f api

# Follow web logs only
logs-web:
	docker compose logs -f web

# Build Go binary locally
build:
	go build -o tmp/main ./cmd/server/main.go

# Run Go tests
test:
	go test ./...

# Lint Go code
lint-go:
	go vet ./...

# Lint frontend
lint-web:
	cd web && pnpm lint

# Lint everything
lint: lint-go lint-web

# Generate Ent code
generate:
	go generate ./ent

# Open a psql shell
db-shell:
	docker compose exec db psql -U postgres -d workflow

# Run the API locally (without Docker)
dev-api:
	air -c .air.toml

# Run the frontend locally (without Docker)
dev-web:
	cd web && pnpm dev
