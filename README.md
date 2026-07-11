# 🏋️‍♂️ Web-App Palestra

Una piattaforma web completa e strutturata per la gestione di una palestra, sviluppata con un'architettura a microservizi moderna.

## 🚀 Architettura del Progetto
Questo progetto è composto da diversi moduli indipendenti che comunicano tra loro, orchestrati tramite Docker Compose:

- **Frontend**: L'interfaccia utente interattiva della web app.
- **Backend**: Le API principali e la logica di business.
- **Bot**: Un bot integrato per automatizzare le comunicazioni (es. Telegram/Discord).
- **Scraper**: Un servizio dedicato all'estrazione automatizzata di dati.
- **Database**: Database Postgres per la persistenza dei dati, gestito tramite Prisma ORM, affiancato da Redis per la cache.
- **Nginx**: Reverse proxy per instradare il traffico ai vari servizi.

## 🛠️ Tecnologie Principali
- **Docker & Docker Compose**: Per la containerizzazione e l'orchestrazione.
- **Node.js**: Per i servizi backend e bot.
- **Prisma**: ORM moderno per interagire in modo type-safe con il database.
- **Nginx**: Web server e reverse proxy di produzione.

## 🧠 Graphify AI Integration
Questo progetto include l'integrazione con **Graphify**. Grazie a `.claude/skills/graphify/SKILL.md`, la repository può essere letta da agenti IA mappando il codice in un grafo di conoscenza esplorabile.

## ⚙️ Come Avviare il Progetto
Assicurati di aver compilato correttamente i file `.env` e lancia il comando:
```bash
docker-compose up -d
```
