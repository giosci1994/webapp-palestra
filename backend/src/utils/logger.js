// ============================================
// GymMaster — Logger Strutturato (Pino)
// Logging centralizzato per tutta l'applicazione
// ============================================

import pino from 'pino';

// LIVELLO_LOG lo sceglie a mano (i test usano 'silent'); senza, info in
// produzione e debug altrove
const livello = process.env.LIVELLO_LOG || (process.env.AMBIENTE === 'produzione' ? 'info' : 'debug');

const logger = pino({
  level: livello,
  // In silenzio non serve il worker di pino-pretty
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
  // Non loggare mai dati sensibili
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.passwordHash'],
    censor: '***CENSURATO***'
  }
});

export default logger;
