💰 FinSight

AI-Powered Personal Finance Intelligence Platform

"Java" (https://img.shields.io/badge/Java-21-orange?logo=openjdk)
"Spring Boot" (https://img.shields.io/badge/Spring%20Boot-3.x-brightgreen?logo=springboot)
"React" (https://img.shields.io/badge/React-18-blue?logo=react)
"TypeScript" (https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
"PostgreSQL" (https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)

""Live Demo" (https://img.shields.io/badge/Live%20Demo-Coming%20Soon-orange?style=for-the-badge)" (#)

FinSight transforms raw financial data into actionable intelligence. Import transactions, track spending, set budgets, and let AI surface the insights that matter — all from one beautiful dashboard.

---

✨ Features

- 📊 Smart Dashboard — Real-time overview of net worth, cash flow, and spending trends.
- 🏦 Multi-Account Management — Manage bank accounts, credit cards, investments, and crypto wallets in one place.
- 📥 Transaction Import — Upload CSV, OFX, and QFX files or retrieve transactions through bank integrations.
- 🏷️ Auto-Categorization — AI-powered transaction categorization that learns your spending habits.
- 💡 AI Insights — Natural-language spending summaries, anomaly detection, and saving recommendations powered by LLMs (OpenAI, Anthropic, or Google AI).
- 📈 Budgets & Goals — Set monthly budgets by category and track financial goals.
- 🔔 Alerts & Notifications — Receive alerts for unusual spending, bill reminders, and budget breaches.
- 📑 Reports & Export — Generate detailed PDF and CSV reports for any date range.
- 🔒 Security First — JWT authentication, AES-256 encryption at rest, and role-based access control.

---

🛠️ Tech Stack

Layer| Technology
Backend| Java 21, Spring Boot 3, Spring Security, Spring Data JPA
Frontend| React 18, TypeScript 5, Vite, TailwindCSS
Database| PostgreSQL 16
Cache| Redis 7
AI| OpenAI / Anthropic / Google AI
Object Storage| MinIO (S3-compatible)
Email| Mailpit (local) / SMTP (production)
CI/CD| GitHub Actions

---

📋 Prerequisites

Tool| Version| Purpose
Java| 21+| Backend runtime
Node.js| 20+| Frontend tooling
Docker| 24+| Infrastructure services
Make| Any| Task runner (optional)

---

🚀 Getting Started

1. Clone the repository

git clone https://github.com/your-org/finsight.git
cd finsight

2. Configure environment variables

cp .env.example .env

Update the ".env" file with your database credentials, AI API keys, and other required configuration.

3. Start infrastructure services

make dev-up

This starts PostgreSQL, Redis, MinIO, and Mailpit.

4. Start the backend

make backend-run

Backend runs at:

"http://localhost:8080"

5. Start the frontend

Install dependencies:

make frontend-install

Start the development server:

make frontend-dev

Frontend runs at:

"http://localhost:5173"

6. Application URLs

Service| URL
Frontend| http://localhost:5173
Backend API| http://localhost:8080/api
Mailpit UI| http://localhost:8025
MinIO Console| http://localhost:9001

---

📁 Project Structure

finsight/
│
├── backend/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/             # Java source code
│   │   │   └── resources/        # Configuration and migrations
│   │   └── test/                 # Unit and integration tests
│   └── pom.xml
│
├── frontend/
│   ├── src/
│   │   ├── components/           # Reusable UI components
│   │   ├── pages/                # Application pages
│   │   ├── hooks/                # Custom React hooks
│   │   ├── services/             # API client layer
│   │   └── store/                # State management
│   ├── package.json
│   └── vite.config.ts
│
├── .github/
│   └── workflows/                # GitHub Actions CI pipelines
│
├── docker-compose.yml            # Infrastructure configuration
├── Makefile                      # Developer task runner
├── .env.example                  # Environment template
└── README.md

---

🔄 Development Workflow

Run all tests

make test

Build the project

make build

Reset development environment

make dev-reset

Note: This command wipes the database and associated volumes.

Clean build artifacts

make clean

---

🧪 Testing

Backend Testing

Backend tests use JUnit 5 and Testcontainers.

make backend-test

Frontend Testing

Frontend tests use Vitest.

make frontend-test

GitHub Actions automatically runs CI workflows on every push and pull request to the "main" branch.

---

🌐 Live Demo

Coming Soon!

The FinSight application will be publicly accessible once deployment is complete.

---

🔐 Security

FinSight is designed with security in mind:

- JWT-based authentication.
- AES-256 encryption at rest.
- Role-based access control.
- Environment-based secret management.
- Secure API communication.

Never commit your ".env" file, API keys, database passwords, or other sensitive credentials to GitHub.

---

<div align="center">Built with ☕ and ❤️ by the FinSight team

</div>