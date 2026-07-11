// ============================================
// GymMaster — Logger Strutturato (Pino)
// Logging centralizzato per tutta l'applicazione
// ============================================

import pino from 'pino';

const livello = process.env.AMBIENTE === 'produzione' ? 'info' : 'debug';

const logger = pino({
  level: livello,
  transport: process.env.AMBIENTE !== 'produzione'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    : undefined,
  // Non loggare mai dati sensibili
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.passwordHash'],
    censor: '***CENSURATO***'
  }
});

export default logger;
