-- Token salvati solo come impronta SHA-256 (esadecimale).
--
-- Chi ottiene una copia del database (un backup, un dump) non deve trovarci
-- token funzionanti: un refresh token dura fino a 30 giorni e apre l'account,
-- un token di reset cambia la password. I token sono lunghi e casuali, quindi
-- basta SHA-256: una funzione lenta come argon2 non aggiungerebbe nulla.
--
-- Qui si convertono quelli gia' emessi: il client continua a presentare il suo
-- token e il server ne calcola l'impronta, quindi nessuno viene scollegato.
-- Un'istruzione per riga: il test della conversione le esegue una per una.

UPDATE "refresh_tokens" SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex');
UPDATE "utenti" SET "token_verifica_email" = encode(sha256(convert_to("token_verifica_email", 'UTF8')), 'hex') WHERE "token_verifica_email" IS NOT NULL;
UPDATE "utenti" SET "token_reset_password" = encode(sha256(convert_to("token_reset_password", 'UTF8')), 'hex') WHERE "token_reset_password" IS NOT NULL;
