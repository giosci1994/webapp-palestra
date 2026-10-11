// ============================================
// GymMaster — Test: a software passkey authenticator
// ============================================
//
// It does what the phone does: it creates a P-256 key pair, answers
// registration with an attestation object ("none" format) and sign-in with an
// ECDSA signature over authenticatorData + the hash of clientDataJSON. This way
// the tests go through the real @simplewebauthn/server verification without a
// device.

import crypto from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const b64u = byte => Buffer.from(byte).toString('base64url');
const sha256 = dati => crypto.createHash('sha256').update(dati).digest();

// authenticatorData flags: user present, user verified, credential data
const UP = 0x01;
const UV = 0x04;
const AT = 0x40;

function contatoreBE(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n);
  return buf;
}

/**
 * @param {{ origine: string, rpID: string }} config - usually configurazionePasskey()
 */
export function creaAutenticatore({ origine, rpID }) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const idCredenziale = crypto.randomBytes(16);
  const id = b64u(idCredenziale);
  let contatore = 0;

  // COSE public key: kty EC2, alg ES256, curve P-256, x, y
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

    /** The response to navigator.credentials.create() */
    registra(opzioni, { origine: o = origine } = {}) {
      const lunghezzaId = Buffer.alloc(2);
      lunghezzaId.writeUInt16BE(idCredenziale.length);
      const authData = Buffer.concat([
        sha256(rpID), Buffer.from([UP | UV | AT]), contatoreBE(contatore),
        Buffer.alloc(16), // AAGUID: no model declared
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
     * The response to navigator.credentials.get(). The counter goes up with
     * every signature; `contatore` forces it, to simulate a cloned passkey.
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
