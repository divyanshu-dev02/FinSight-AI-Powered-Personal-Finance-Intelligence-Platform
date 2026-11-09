<div align="center">

# 💰 FinSight

### AI-Powered Personal Finance Intelligence Platform

[![Java](https://img.shields.io/badge/Java-21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)](https://openjdk.org/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.x-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**FinSight** transforms your raw financial data into actionable intelligence. Import transactions, track spending, set budgets, and let AI surface the insights that matter — all from one beautiful dashboard.

</div>

---

## ✨ Features

- **📊 Smart Dashboard** — Real-time overview of net worth, cash flow, and spending trends.
- **🏦 Multi-Account Management** — Connect and manage bank accounts, credit cards, investments, and crypto wallets in one place.
- **📥 Transaction Import** — Upload CSV/OFX/QFX files or pull transactions via bank integrations.
- **🏷️ Auto-Categorization** — AI-powered transaction categorization that learns your habits.
- **💡 AI Insights** — Natural-language spending summaries, anomaly detection, and saving recommendations driven by LLMs (OpenAI, Anthropic, or Google AI).
- **📈 Budgets & Goals** — Set monthly budgets per category and track progress toward financial goals.
- **🔔 Alerts & Notifications** — Configurable alerts for unusual spending, bill reminders, and budget breaches.
- **📑 Reports & Export** — Generate detailed PDF/CSV reports for any date range.
- **🔒 Security First** — JWT authentication, AES-256 data encryption at rest, and role-based access control.

---

## 🛠️ Tech Stack

| Layer            | Technology                                         |
| ---------------- | -------------------------------------------------- |
| **Backend**      | Java 21, Spring Boot 3, Spring Security, Spring Data JPA |
| **Frontend**     | React 18, TypeScript 5, Vite, TailwindCSS          |
| **Database**     | PostgreSQL 16                                      |
| **Cache**        | Redis 7                                            |
| **AI**           | OpenAI / Anthropic / Google AI (pluggable)         |
| **Object Store** | MinIO (S3-compatible)                               |
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
git clone https://github.com/your-org/finsight.git
cd finsight
cp .env.example .env          # edit .env with your API keys
```

### 2. Start infrastructure

```bash
make dev-up                   # starts Postgres, Redis, MinIO, Mailpit
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
| MinIO Console  | http://localhost:9001         |

---

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
# Backend tests (JUnit 5 + Testcontainers)
make backend-test

# Frontend tests (Vitest)
make frontend-test
```

CI runs automatically on every push and pull request to `main` via GitHub Actions.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <sub>Built with ☕ and ❤️ by the FinSight team</sub>
</div>
