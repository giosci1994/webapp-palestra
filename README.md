# 🏋️‍♂️ GymMaster (Web-App Palestra)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-Backend-green.svg?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/PostgreSQL-Database-blue.svg?logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Prisma-ORM-black.svg?logo=prisma" alt="Prisma">
  <img src="https://img.shields.io/badge/Docker-Microservices-2496ED.svg?logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/License-Proprietary-red.svg" alt="License">
</p>

*Read this in other languages: [Italiano](#italiano)*

A complete, modern microservice architecture platform designed for comprehensive gym management. It integrates a web dashboard, an automated Telegram bot, and background services for data aggregation.

## ✨ Key Features

- 📊 **Interactive Dashboard**: Modern UI for user and administrative management.
- 🤖 **Telegram Bot**: Automated notifications and interactions via Telegram.
- 🔄 **Real-Time Data**: Redis caching for fast data retrieval and WebSocket support.
- 📈 **Automated Scraper**: Extracts real-time gym attendance and population data.
- 🔐 **Secure & Scalable**: Containerized microservices with robust JWT authentication.

## 🚀 Architecture

This project is built using isolated modules orchestrated via **Docker Compose**:

- **Frontend**: The interactive UI.
- **Backend**: Core APIs and business logic.
- **Bot**: The integrated Telegram/Discord bot service.
- **Scraper**: Automated data extraction cron jobs.
- **Database**: PostgreSQL for persistence (via Prisma ORM), plus Redis for caching.
- **Nginx**: Reverse proxy to route external traffic.

## 🛠️ Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose installed.
- A copied and configured `.env` file (see `.env.esempio`).

### Installation

1. Clone the repository.
2. Configure your environment variables:
   ```bash
   cp .env.esempio .env
   # Edit .env with your credentials
   ```
3. Start the entire stack:
   ```bash
   docker-compose up -d --build
   ```

## 🧠 AI Graphify Integration
This repository is fully compatible with **Graphify**. Through `.claude/skills/graphify/SKILL.md`, AI agents can map and explore the source code as a knowledge graph, ensuring better context for automated assistance.

## 📄 License
This project is **Proprietary**. See the [LICENSE](LICENSE) file for details.

<br>

---
---

<a id="italiano"></a>

# 🇮🇹 Italiano

Una piattaforma web completa e strutturata per la gestione di una palestra, sviluppata con un'architettura a microservizi moderna per scalabilità e performance.

## ✨ Funzionalità Principali

- 📊 **Dashboard Interattiva**: Gestione semplificata per clienti e Personal Trainer.
- 🤖 **Bot Telegram Integrato**: Notifiche automatiche e interazione rapida con gli utenti.
- 🔄 **Dati in Tempo Reale**: Utilizzo di Redis per cache e comunicazioni veloci.
- 📈 **Scraper Automatizzato**: Raccolta dei dati sull'affluenza in tempo reale.
- 🔐 **Sicura e Scalabile**: Architettura a microservizi orchestrata tramite container.

## 🚀 Architettura del Progetto

Questo progetto è composto da diversi moduli indipendenti che comunicano tra loro, orchestrati tramite **Docker Compose**:

- **Frontend**: L'interfaccia utente interattiva della web app.
- **Backend**: Le API principali e la logica di business.
- **Bot**: Un bot integrato per automatizzare le comunicazioni.
- **Scraper**: Un servizio dedicato all'estrazione automatizzata di dati.
- **Database**: Database Postgres gestito tramite Prisma ORM, affiancato da Redis.
- **Nginx**: Reverse proxy per instradare il traffico ai vari servizi in sicurezza.

## 🛠️ Come Avviare il Progetto

### Prerequisiti
- [Docker](https://www.docker.com/) e Docker Compose installati sul server/PC.

### Avvio rapido

1. Clona il repository.
2. Assicurati di aver compilato correttamente il file delle variabili d'ambiente:
   ```bash
   cp .env.esempio .env
   # Modifica il file .env con i tuoi dati
   ```
3. Avvia tutti i servizi:
   ```bash
   docker-compose up -d --build
   ```

## 🧠 Integrazione Graphify AI
Questo progetto include l'integrazione con **Graphify**. Grazie a `.claude/skills/graphify/SKILL.md`, la repository può essere letta in modo nativo da agenti IA, mappando il codice in un grafo di conoscenza esplorabile.

## 📄 Licenza
Il progetto è **Proprietario** (Tutti i diritti riservati). Leggi il file [LICENSE](LICENSE) per ulteriori dettagli.
