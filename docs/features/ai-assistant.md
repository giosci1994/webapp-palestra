# AI assistant

## Overview

**GymBot** is a fitness assistant powered by the **Google Gemini API** (`gemini-2.5-flash`). It answers with the user's own training data in mind.

It can:
- 📊 review a training plan;
- 📈 suggest how to progress loads;
- ⚖️ spot muscle imbalances;
- 🔄 swap an exercise when a machine is taken;
- 💬 answer general fitness questions.

The same key also powers the Telegram bot's guided plan creation.

Code: `backend/src/services/assistente.service.js`, `routes/assistente.routes.js`; in the frontend `pagine/Assistente.jsx`.

## Setup

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Click **Create API Key**.
3. Put the key in `.env`:
   ```
   GEMINI_API_KEY=your_key
   ```

Without the key the assistant stays off and the rest of the app works. The free tier is enough for a small gym (check Google's current limits).

## Endpoints (`/api/v1/assistente`)

| Method | Path | Rate limit | Description |
|--------|------|------------|-------------|
| POST | `/chiedi` | 5/min per user | Ask a question |
| GET | `/conversazioni` | 5/min per user | Past conversations |

### Request

```json
POST /api/v1/assistente/chiedi
{
  "messaggio": "I benched 100 kg at RPE 6, should I add weight?",
  "conversazioneAiId": null
}
```

### Response

```json
{
  "successo": true,
  "dati": {
    "conversazioneAiId": 42,
    "risposta": "💪 At RPE 6 you still have room! Add 2.5 kg next session..."
  }
}
```

## Context

Every question comes with:
- the user's name and gym;
- the last 5 workouts;
- recent personal records;
- the conversation so far (last 20 messages).

So the answers are personal, without the user repeating anything.
