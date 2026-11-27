<div align="center">

# 💰 FinSight

### AI-Powered Personal Finance Intelligence Platform

[![Java](https://img.shields.io/badge/Java-21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)](https://openjdk.org/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.x-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**FinSight** transforms your raw financial data into actionable intelligence. Import transactions, track spending, set budgets, and let AI surface the insights that matter — all from one beautiful dashboard.

</div>

---

## Features

- **Dashboard** — Account balances, cash flow, and spending by category.
- **Accounts and transactions** — Manage accounts, record transfers, and export transactions as CSV.
- **Statement imports** — Review CSV, Excel, and PDF statements before saving.
  Check possible duplicates, accept or override category suggestions, and save
  merchant rules for future imports. Import history shows saved, skipped, and
  rejected rows. Duplicate skipping is on by default and can be turned off
  for legitimate identical charges.
- **Planning** — Set monthly budgets by category and currency, track savings
  goals, and confirm weekly or monthly bills and income. Link an occurrence
  to a posted transaction so it drops out of upcoming commitments.
- **Spending brief** — Compare spending across periods by currency, review
  possible monthly charges and price increases, and dismiss findings after review.
- **Copilot** — Ask conversational questions about spending, income, account
  balances, budget progress, savings goals, and upcoming commitments. Follow
  up in the same chat and open the sources behind an answer. Spending
  shortcuts work without an AI provider.

### Enable conversational Copilot

Set the provider and credentials in the backend environment, then restart it.
Local development via `make backend-run` also reads an ignored `.env.copilot`
file at the repository root. Use one `NAME=value` per line.

- **Groq** — Set `COPILOT_PROVIDER=groq` and `COPILOT_GROQ_API_KEY`.
  You can override the default `COPILOT_GROQ_MODEL=qwen/qwen3.8-27b`.
- **OpenAI** — Set `COPILOT_PROVIDER=openai`, `COPILOT_OPENAI_API_KEY`,
  and `COPILOT_OPENAI_MODEL`.

The app asks for consent before sharing the chat and the financial data
required by the selected provider. Chat history stays in the current page
session, and the finance tools are read-only.

---

## 🛠️ Tech Stack

| Layer            | Technology                                         |
| ---------------- | -------------------------------------------------- |
| **Backend**      | Java 21, Spring Boot 3, Spring Security, Spring Data JPA |
| **Frontend**     | React 19, TypeScript 5, Vite, TailwindCSS          |
| **Database**     | PostgreSQL 16                                      |
| **Cache**        | Redis 7                                            |
| **AI**           | Groq or OpenAI Responses API (optional)         |
| **Object Store** | S3Mock (optional local S3 API)                               |
| **Email**        | Mailpit (local) / SMTP (production)                |
| **CI/CD**        | GitHub Actions                                     |

---

## 📋 Prerequisites

| Tool       | Version | Purpose               |
| ---------- | ------- | --------------------- |
| **Java**   | 21+     | Backend runtime       |
| **Node.js**| 20+     | Frontend tooling      |
| **Docker** | 24+     | Infrastructure services |
| **Make**   | any     | Task runner (optional)|

---

## 🚀 Quick Start

### 1. Clone & configure

```bash
git clone https://github.com/divyanshu-dev02/FinSight-AI-Powered-Personal-Finance-Intelligence-Platform.git
cd FinSight-AI-Powered-Personal-Finance-Intelligence-Platform
cp .env.example .env
# Set a private DB_PASSWORD and a random JWT_SECRET (at least 32 bytes) in .env.
```

### 2. Start infrastructure

```bash
make dev-up                   # starts Postgres, Redis, Mailpit
docker compose --profile storage up -d s3mock  # optional S3-compatible storage
```

### 3. Run the backend

```bash
make backend-run              # Spring Boot on http://localhost:8080
```

### 4. Run the frontend

```bash
make frontend-install         # first time only
make frontend-dev             # Vite dev server on http://localhost:5173
```

### 5. Open the app

| Service        | URL                          |
| -------------- | ---------------------------- |
| Frontend       | http://localhost:5173         |
| Backend API    | http://localhost:8080/api     |
| Mailpit UI     | http://localhost:8025         |
| S3Mock API     | http://localhost:9000 (optional) |

---

## Demo data

After the local backend applies its database migrations, run `make demo-seed`
to populate the built-in demo account with synthetic transactions, budgets,
savings goals, and recurring commitments. To sign in as
`divyanshu@finsight.local`, set a private `DEMO_PASSWORD` of 16–72 UTF-8 bytes
in the ignored `.env.local` file and restart the local backend. Set
`DEMO_LOGIN_ENABLED=true` in the same file to show **Auto-fill Demo Credentials**
on the local sign-in page. Select it, then **Sign In**. Demo autofill is
limited to the local profile and loopback requests. The seed targets the local Docker
database and can be rerun without duplicating or replacing existing records.

Try asking Copilot, “Compare spending in Demo Everyday this month and last month.
Which expenses explain the biggest difference?”

## 📁 Project Structure

```
finsight/
├── backend/                  # Spring Boot application
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/         # Java source code
│   │   │   └── resources/    # application.yml, migrations
│   │   └── test/             # Unit & integration tests
│   └── pom.xml
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Route-level pages
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API client layer
│   │   └── store/            # State management
│   ├── package.json
│   └── vite.config.ts
├── .github/workflows/        # CI pipelines
├── docker-compose.yml        # Local infrastructure
├── Makefile                  # Developer task runner
├── .env.example              # Environment template
└── README.md
```

---

## 🔄 Development Workflow

```bash
# Run all tests
make test

# Build everything for production
make build

# Full reset (wipes database & volumes)
make dev-reset

# Clean build artifacts
make clean
```

---

## 🧪 Testing

```bash
# Backend tests (Docker must be running for isolated Postgres)
make backend-test

# Frontend tests (Vitest)
cd frontend && npm run test:run
```

CI runs automatically on every push and pull request to `main` via GitHub Actions.

---

<div align="center">
  <sub>Built with ☕ and ❤️ by the FinSight team</sub>
</div>
