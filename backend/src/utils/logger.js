// ============================================
// GymMaster — Structured Logger (Pino)
// Centralised logging for the whole application
// ============================================

import pino from 'pino';

// LIVELLO_LOG picks it by hand (the tests use 'silent'); without it, info in
// production and debug elsewhere
const livello = process.env.LIVELLO_LOG || (process.env.AMBIENTE === 'produzione' ? 'info' : 'debug');

const logger = pino({
  level: livello,
  // When silent, the pino-pretty worker is not needed
  transport: process.env.AMBIENTE !== 'produzione' && livello !== 'silent'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    : undefined,
  // Never log sensitive data
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.passwordHash'],
    censor: '***CENSURATO***'
  }
});

export default logger;
