-- Fine della grazia a tempo dei refresh token.
--
-- Un token sostituito valeva ancora 40 secondi, poi presentarlo voleva dire
-- furto. Ma un browser chiuso subito dopo un rinnovo puo' non aver salvato su
-- disco il cookie nuovo, e ripresentare il vecchio anche ore dopo: l'utente
-- veniva scollegato. Ora un token sostituito si accetta finche' il suo
-- sostituto non e' stato usato (autenticazione.service.js, rinnovaToken), e
-- l'ora di fine grazia non serve piu'.

ALTER TABLE "refresh_tokens" DROP COLUMN "revoco_effettivo_dopo";
