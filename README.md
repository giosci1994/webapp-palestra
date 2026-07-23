# 🏋️‍♂️ GymMaster (Web-App Palestra)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Backend-green.svg?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB.svg?logo=react" alt="React">
  <img src="https://img.shields.io/badge/PostgreSQL-Database-blue.svg?logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Prisma-ORM-black.svg?logo=prisma" alt="Prisma">
  <img src="https://img.shields.io/badge/Docker-Microservices-2496ED.svg?logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/License-Proprietary-red.svg" alt="License">
</p>

*Read this in other languages: [Italiano](#italiano)*

A complete, modern microservice architecture platform designed for comprehensive gym management. It integrates a web dashboard, an automated Telegram bot, and background services for data aggregation to provide a unified experience for both gym members and administrators.

<p align="center">
  <!-- Placeholders for future screenshots -->
  <img src="https://via.placeholder.com/400x250.png?text=Dashboard+Preview" width="400" alt="Dashboard Preview" />
  &nbsp;&nbsp;
  <img src="https://via.placeholder.com/200x250.png?text=Mobile+App" width="200" alt="Mobile App" />
</p>

---

## ✨ Key Features

- 📊 **Interactive Dashboard**: Modern, responsive UI for user management, workout tracking, and analytics.
- 🤖 **Telegram Bot**: Automated notifications, quick actions, and interactions via the `grammY` framework.
- 🔄 **Real-Time Data**: Redis caching for fast data retrieval and WebSocket support for live updates.
- 📈 **Automated Scraper**: A Playwright-powered microservice that extracts real-time gym attendance and population data.
- 🔐 **Secure & Scalable**: Isolated containerized microservices with robust JWT (JSON Web Token) authentication and PKCE OAuth flows.

---

## 🚀 Architecture & Tech Stack

This project is built as a monorepo, where isolated modules communicate with each other, orchestrated via **Docker Compose**.

```text
webapp-palestra/
├── frontend/       # React SPA (Vite, TailwindCSS)
├── backend/        # Node.js REST API + WebSocket Server
├── bot/            # Telegram Bot microservice (grammY)
├── scraper/        # Automated data extraction (Playwright)
├── prisma/         # Database schema and migrations
└── nginx/          # Reverse proxy and load balancer
```

### Core Technologies
- **Frontend**: React 19+, Vite, TailwindCSS (Vanilla CSS fallback).
- **Backend**: Node.js, Express.
- **Database**: PostgreSQL 17 (managed via **Prisma ORM**).
- **Cache / Messaging**: Redis 7.
- **Infrastructure**: Docker, Docker Compose, Nginx.

---

## 🛠️ Getting Started (Production)

### Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose installed.
- A registered Telegram Bot token (from [@BotFather](https://t.me/botfather)).

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/giosci1994/webapp-palestra.git
   cd webapp-palestra
   ```

2. **Configure Environment Variables**:
   Copy the example environment file and fill in your secure credentials:
   ```bash
   cp .env.esempio .env
   ```
   *Make sure to change the default passwords, JWT secrets, and API keys.*

3. **Start the Stack**:
   Launch all microservices in the background:
   ```bash
   docker-compose up -d --build
   ```

4. **Access the App**:
   The web application will be available at `http://localhost:6969` (or your configured domain).

---

## 💻 Local Development

If you want to run the modules locally without Docker (e.g., for frontend development):

```bash
# 1. Start only the databases (Postgres & Redis)
docker-compose up -d db redis

# 2. Run Prisma Migrations
cd backend && npx prisma migrate dev

# 3. Start Backend
npm run dev

# 4. Start Frontend (in a new terminal)
cd ../frontend
npm run dev
```

---

## 🧠 AI Graphify Integration
This repository is fully compatible with **Graphify**. Through `.claude/skills/graphify/SKILL.md`, AI agents can map and explore the source code as a knowledge graph, ensuring better context for automated assistance and deep architectural understanding.

---

## 📄 License
This project is **Proprietary**. See the [LICENSE](LICENSE) file for details.
Copyright © 2026 giosci1994. All Rights Reserved.

<br>

---
---

<a id="italiano"></a>

# 🇮🇹 Italiano

Una piattaforma web completa e strutturata per la gestione di una palestra, sviluppata con un'architettura a microservizi moderna per garantire scalabilità e performance elevate sia lato utente che lato server.

<p align="center">
  <!-- Placeholders per futuri screenshot -->
  <img src="https://via.placeholder.com/400x250.png?text=Anteprima+Dashboard" width="400" alt="Anteprima Dashboard" />
  &nbsp;&nbsp;
  <img src="https://via.placeholder.com/200x250.png?text=Bot+Telegram" width="200" alt="Bot Telegram" />
</p>

---

## ✨ Funzionalità Principali

- 📊 **Dashboard Interattiva**: Interfaccia moderna e reattiva per i clienti e gli amministratori.
- 🤖 **Bot Telegram Integrato**: Notifiche automatiche e interazione rapida con gli utenti tramite il framework `grammY`.
- 🔄 **Dati in Tempo Reale**: Utilizzo di Redis per la cache e per il supporto WebSocket.
- 📈 **Scraper Automatizzato**: Microservizio basato su Playwright per la raccolta dei dati sull'affluenza in tempo reale.
- 🔐 **Sicura e Scalabile**: Architettura a microservizi isolati tramite container, con autenticazione robusta basata su JWT.

---

## 🚀 Struttura e Architettura

Il progetto è un monorepo orchestrato tramite **Docker Compose**:

```text
webapp-palestra/
├── frontend/       # React SPA (Vite)
├── backend/        # API REST Node.js
├── bot/            # Microservizio Bot Telegram
├── scraper/        # Estrazione dati automatizzata
├── prisma/         # Schema del Database
└── nginx/          # Reverse proxy
```

---

## 🛠️ Come Avviare il Progetto (Produzione)

### Prerequisiti
- [Docker](https://www.docker.com/) e Docker Compose installati sul server/PC.
- Un Token Telegram (ottenibile tramite [@BotFather](https://t.me/botfather)).

### Avvio rapido

1. **Clona il repository**:
   ```bash
   git clone https://github.com/giosci1994/webapp-palestra.git
   cd webapp-palestra
   ```

2. **Configura le variabili d'ambiente**:
   ```bash
   cp .env.esempio .env
   # Modifica il file .env inserendo password sicure e le tue API keys
   ```

3. **Avvia tutti i servizi**:
   ```bash
   docker-compose up -d --build
   ```

4. **Accedi all'App**:
   L'applicazione sarà disponibile su `http://localhost:6969`.

---

## 💻 Sviluppo Locale (Senza Docker completo)

Per sviluppare rapidamente sul frontend o backend senza containerizzare tutto l'ambiente:

```bash
# 1. Avvia solo Postgres e Redis
docker-compose up -d db redis

# 2. Sincronizza il database
cd backend && npx prisma migrate dev

# 3. Avvia il Backend
npm run dev

# 4. Avvia il Frontend (in un altro terminale)
cd ../frontend
npm run dev
```

---

## 🧠 Integrazione Graphify AI
Questo progetto include l'integrazione con **Graphify**. Grazie a `.claude/skills/graphify/SKILL.md`, la repository può essere letta in modo nativo da agenti IA, mappando il codice in un grafo di conoscenza esplorabile.

---

## 📄 Licenza
Il progetto è **Proprietario** (Tutti i diritti riservati). Leggi il file [LICENSE](LICENSE) per ulteriori dettagli.
Copyright © 2026 giosci1994. Tutti i diritti riservati.
