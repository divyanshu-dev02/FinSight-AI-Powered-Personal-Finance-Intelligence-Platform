# ──────────────────────────────────────────────────────────────
# FinSight – Development Makefile
# ──────────────────────────────────────────────────────────────

.PHONY: dev-up dev-down dev-reset \
        backend-run backend-test backend-build \
        frontend-install frontend-dev frontend-test frontend-build \
        test build clean

# ── Infrastructure ────────────────────────────────────────────

## Start all Docker services in the background
dev-up:
	docker compose up -d

## Stop all Docker services
dev-down:
	docker compose down

## Stop all Docker services and remove volumes (full reset)
dev-reset:
	docker compose down -v

# ── Backend (Spring Boot / Maven) ─────────────────────────────

## Run the backend in local profile
backend-run:
	cd backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=local

## Run backend unit & integration tests
backend-test:
	cd backend && ./mvnw test

## Build backend JAR (skip tests for speed)
backend-build:
	cd backend && ./mvnw clean package -DskipTests

# ── Frontend (React / Vite) ──────────────────────────────────

## Install frontend dependencies
frontend-install:
	cd frontend && npm install

## Start frontend dev server
frontend-dev:
	cd frontend && npm run dev

## Run frontend tests
frontend-test:
	cd frontend && npm test

## Create production frontend build
frontend-build:
	cd frontend && npm run build

# ── Aggregate ─────────────────────────────────────────────────

## Run all tests (backend + frontend)
test: backend-test frontend-test

## Build everything (backend + frontend)
build: backend-build frontend-build

## Clean all build artifacts
clean:
	cd backend && ./mvnw clean && cd ../frontend && rm -rf dist node_modules
