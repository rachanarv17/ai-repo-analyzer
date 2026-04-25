# AI Repository Analyzer 🔬

[![CI Pipeline](https://github.com/rachanarv17/ai-repo-analyzer/actions/workflows/main.yml/badge.svg)](https://github.com/rachanarv17/ai-repo-analyzer/actions)
![GitHub repo size](https://img.shields.io/github/repo-size/rachanarv17/ai-repo-analyzer?color=bd9dff)
![GitHub last commit](https://img.shields.io/github/last-commit/rachanarv17/ai-repo-analyzer?color=53ddfc)
![License](https://img.shields.io/github/license/rachanarv17/ai-repo-analyzer?color=34d399)

**AI Repository Analyzer** is a state-of-the-art, full-stack security and quality orchestration platform. It automatically clones public GitHub repositories, performs multi-layer static analysis, and leverages AI to provide deep explanations and actionable fix suggestions.

[Explore the Docs](#-system-architecture) • [Quick Start](#-quick-start-docker) • [Features](#-key-features)

---

## 🌟 Key Features

| Category | Features |
| :--- | :--- |
| **🛡️ Security** | Multi-language Secrets Detection, Bandit SAST for Python, Config File Auditing |
| **📊 Analytics** | Interactive Sparkline Trends, Issue Severity Heatmaps, Dashboard Insights |
| **🤖 AI Insights** | GPT-4o powered fix suggestions, Context-aware vulnerability explanations |
| **📄 Reporting** | Professional PDF Export, Industry-standard SARIF JSON for CI/CD integration |
| **⚡ Performance** | Distributed Analysis via Redis Queue, Async FastAPI, Shimmer Skeleton Loaders |
| **⌨️ UX/UI** | Dark-mode Glassmorphism, Keyboard Shortcuts (`?`), Global Toast System |

---

## 🧱 System Architecture

The platform is designed as a distributed micro-services architecture to ensure scalability and separation of concerns.

```mermaid
graph TD
    User([User]) <--> Frontend[Next.js 15 Frontend]
    
    subgraph "Unified Gateway"
        Frontend --> APIProxy[API Proxy Routes]
        APIProxy --> Auth[NextAuth.js]
    end

    APIProxy <--> Backend[FastAPI Backend]

    subgraph "Heavy Lifting Engine"
        Backend --> DB[(PostgreSQL)]
        Backend --> Redis[(Redis Queue)]
        Redis <--> Worker[RQ Worker]
        Worker --> Clone[Git Clone]
        Worker --> Static[Static Analyzers]
        Static --> Secrets[Secrets Detector]
        Static --> Pylint[Pylint/Flake8]
        Static --> Bandit[Bandit Security]
        Worker --> AI[OpenAI GPT-4o]
    end
    
    Clone --> Files[Local Filesystem]
    Static --> Files
```

---

## 🚀 Quick Start (Docker)

Get the entire stack up and running in under 2 minutes:

```bash
# 1. Clone the repository
git clone https://github.com/rachanarv17/ai-repo-analyzer.git
cd ai-repo-analyzer

# 2. Configure environment
cp .env.example .env

# 3. Launch with Docker Compose
docker compose up -d --build
```

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide Icons
- **Backend**: FastAPI (Python 3.11), SQLAlchemy, Pydantic v2
- **Data & Queue**: PostgreSQL, Redis, Python-RQ
- **Analysis Tools**: Pylint, Bandit, Flake8, Pip-audit, Custom Regex-based Secrets Engine
- **Auth**: NextAuth.js (Auth.js v5)

---

## 📋 Roadmap Status

- [x] **Phase 1**: Core Python Analysis (Quality & Security)
- [x] **Phase 2**: Analytics Dashboard & PDF Export
- [x] **Phase 3**: Multi-language Secrets Detection
- [x] **Phase 4**: Architectural Interconnection (Next.js Proxy)
- [ ] **Phase 5**: Advanced Dependency Graph Visualization (Coming Soon)
- [ ] **Phase 6**: Team Workspaces & Shared History (Planned)

---

## 🔌 API & Integration

### `POST /api/scan`
Submit a repository for deep analysis.
```json
{
  "repo_url": "https://github.com/psf/requests"
}
```

### SARIF Integration
Download results via `GET /api/scan/{id}/sarif` to integrate with **GitHub Code Scanning** or **SonarQube**.

---

## ⚠️ Support & Constraints

- ✅ Supports **Public GitHub Repositories** only.
- ✅ Full deep-dive analysis for **Python** projects.
- ✅ **Secrets Detection** supported for all languages.
- ✅ Requires **OpenAI API Key** for enhanced AI suggestions (optional).

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/rachanarv17">Rachana RV</a></sub>
</div>
