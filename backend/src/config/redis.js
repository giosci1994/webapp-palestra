// ============================================
// GymMaster — Redis configuration (ioredis)
// Singleton used for the Telegram bot's ephemeral state
// (draft of the plan being built, conversation history, rate limit).
// ============================================

import Redis from 'ioredis';
import logger from '../utils/logger.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
  maxRetriesPerRequest: 2,
  retryStrategy: (tentativi) => Math.min(tentativi * 200, 2000)
});

redis.on('error', (e) => logger.error({ erroreRedis: e.message }, 'Errore Redis'));
redis.on('connect', () => logger.info('Redis connesso'));

export default redis;
