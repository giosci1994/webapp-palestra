// ============================================
// GymMaster — Test: un autenticatore di passkey in software
// ============================================
//
// Fa quello che fa il telefono: crea una coppia di chiavi P-256, risponde alla
// registrazione con un attestation object (formato "none") e all'accesso con
// una firma ECDSA su authenticatorData + hash del clientDataJSON. Cosi' i test
// attraversano la verifica vera di @simplewebauthn/server senza un dispositivo.

import crypto from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const b64u = byte => Buffer.from(byte).toString('base64url');
const sha256 = dati => crypto.createHash('sha256').update(dati).digest();

// Flag di authenticatorData: utente presente, utente verificato, dati della credenziale
const UP = 0x01;
const UV = 0x04;
const AT = 0x40;

function contatoreBE(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n);
  return buf;
}

/**
 * @param {{ origine: string, rpID: string }} config - di solito configurazionePasskey()
 */
export function creaAutenticatore({ origine, rpID }) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const idCredenziale = crypto.randomBytes(16);
  const id = b64u(idCredenziale);
  let contatore = 0;

  // Chiave pubblica COSE: kty EC2, alg ES256, curva P-256, x, y
  const chiaveCose = isoCBOR.encode(new Map([
    [1, 2], [3, -7], [-1, 1],
    [-2, Buffer.from(jwk.x, 'base64url')],
    [-3, Buffer.from(jwk.y, 'base64url')]
  ]));

  const clientData = (tipo, sfida, o) => Buffer.from(JSON.stringify({
    type: tipo, challenge: sfida, origin: o, crossOrigin: false
  }));

  return {
    id,

    /** La risposta a navigator.credentials.create() */
    registra(opzioni, { origine: o = origine } = {}) {
      const lunghezzaId = Buffer.alloc(2);
      lunghezzaId.writeUInt16BE(idCredenziale.length);
      const authData = Buffer.concat([
        sha256(rpID), Buffer.from([UP | UV | AT]), contatoreBE(contatore),
        Buffer.alloc(16), // AAGUID: nessun modello dichiarato
        lunghezzaId, idCredenziale, Buffer.from(chiaveCose)
      ]);
      const attestationObject = isoCBOR.encode(new Map([
        ['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]
      ]));
      return {
        id, rawId: id, type: 'public-key',
        response: {
          clientDataJSON: b64u(clientData('webauthn.create', opzioni.challenge, o)),
          attestationObject: b64u(attestationObject),
          transports: ['internal', 'hybrid']
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform'
      };
    },

    /**
     * La risposta a navigator.credentials.get(). Il contatore sale a ogni firma;
     * `contatore` lo forza, per simulare una passkey clonata.
     */
    firma(opzioni, { origine: o = origine, contatore: forzato } = {}) {
      contatore = forzato ?? contatore + 1;
      const authData = Buffer.concat([sha256(rpID), Buffer.from([UP | UV]), contatoreBE(contatore)]);
      const dati = clientData('webauthn.get', opzioni.challenge, o);
      const firma = crypto.sign('sha256', Buffer.concat([authData, sha256(dati)]), privateKey);
      return {
        id, rawId: id, type: 'public-key',
        response: {
          clientDataJSON: b64u(dati),
          authenticatorData: b64u(authData),
          signature: b64u(firma)
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform'
      };
    }
  };
}
