// ============================================
// GymMaster — Crowd report validation schema
// ============================================

import { z } from 'zod';
import { numero } from './schede.schema.js';
import { LIVELLO_MASSIMO } from '../utils/affluenzaSegnalata.js';

/** Schema for POST /sessioni/:id/affluenza: the level the user tapped, 0-3 */
export const schemaSegnalaAffluenza = z.object({
  livello: numero('affluenzaSchema.livelloNonValido', { min: 0, max: LIVELLO_MASSIMO, obbligatorio: 'affluenzaSchema.livelloNonValido' })
}, { error: 'affluenzaSchema.corpoNonValido' });
