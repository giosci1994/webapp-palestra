// ============================================
// GymMaster — Traduzione nomi esercizi EN → IT
// ============================================
//
// Il catalogo è quasi tutto in inglese e questo lo rende inutilizzabile in
// ricerca: "affondo" restituiva zero risultati su 540 lunge presenti.
//
// I 3313 nomi sono composti da sole 480 parole distinte, quindi la traduzione
// è un problema di dizionario, non di linguaggio naturale. L'approccio qui è
// deterministico: stesso nome in ingresso, stesso nome in uscita, e correggere
// una voce del dizionario rigenera coerentemente tutti i nomi che la usano.
//
// L'italiano però riordina: "Double Dumbbell Romanian Deadlift" non è
// "Doppio Manubrio Rumeno Stacco" ma "Stacco Rumeno con Due Manubri". Ogni
// termine porta quindi un RUOLO, e la ricomposizione mette il movimento
// davanti, i modificatori in mezzo e l'attrezzo in coda dopo "con".
//
// Nota di calibrazione: in palestra molti termini si dicono in inglese anche
// in italiano. Squat, plank, burpee, swing, snatch, clean, curl, hip thrust
// restano tali: tradurli renderebbe i nomi meno riconoscibili, non più.

export const RUOLI = {
  ATTREZZO: 'attrezzo',      // va in coda, preceduto da "con"
  POSIZIONE: 'posizione',    // da seduto, in piedi, in ginocchio…
  VARIANTE: 'variante',      // reverse, alternato, isometrico…
  MOVIMENTO: 'movimento',    // il gesto vero e proprio
  PARTE: 'parte',            // distretto anatomico, segue il movimento
};

// Match più lungo per primo: "single arm cable" prima di "cable".
// [ inglese, italiano, ruolo ]
export const TERMINI = [
  // ---------- Attrezzi (con quantità incorporata) ----------
  ['single arm kettlebell', 'Kettlebell a Un Braccio', RUOLI.ATTREZZO],
  ['single arm dumbbell', 'Manubrio a Un Braccio', RUOLI.ATTREZZO],
  ['single arm cable', 'Cavo a Un Braccio', RUOLI.ATTREZZO],
  ['single arm clubbell', 'Clubbell a Un Braccio', RUOLI.ATTREZZO],
  ['single arm macebell', 'Macebell a Un Braccio', RUOLI.ATTREZZO],
  ['single arm landmine', 'Landmine a Un Braccio', RUOLI.ATTREZZO],
  ['single arm barbell', 'Bilanciere a Un Braccio', RUOLI.ATTREZZO],
  ['single arm suspension', 'Suspension a Un Braccio', RUOLI.ATTREZZO],
  ['single arm sandbag', 'Sandbag a Un Braccio', RUOLI.ATTREZZO],
  ['single arm superband', 'Superband a Un Braccio', RUOLI.ATTREZZO],
  ['single arm miniband', 'Miniband a Un Braccio', RUOLI.ATTREZZO],
  ['single arm plate', 'Disco a Un Braccio', RUOLI.ATTREZZO],
  ['single arm ring', 'Anelli a Un Braccio', RUOLI.ATTREZZO],
  ['double kettlebell', 'Due Kettlebell', RUOLI.ATTREZZO],
  ['double dumbbell', 'Due Manubri', RUOLI.ATTREZZO],
  ['double clubbell', 'Due Clubbell', RUOLI.ATTREZZO],
  ['double macebell', 'Due Macebell', RUOLI.ATTREZZO],
  ['double sandbag', 'Due Sandbag', RUOLI.ATTREZZO],
  ['double superband', 'Due Superband', RUOLI.ATTREZZO],
  ['double miniband', 'Due Miniband', RUOLI.ATTREZZO],
  ['double parallette', 'Parallette', RUOLI.ATTREZZO],
  ['cable rope', 'Cavo e Corda', RUOLI.ATTREZZO],
  ['battle rope', 'Battle Rope', RUOLI.ATTREZZO],
  ['stability ball', 'Fitball', RUOLI.ATTREZZO],
  ['medicine ball', 'Palla Medica', RUOLI.ATTREZZO],
  ['resistance band', 'Elastico', RUOLI.ATTREZZO],
  ['ez bar', 'Bilanciere EZ', RUOLI.ATTREZZO],
  ['trap bar', 'Trap Bar', RUOLI.ATTREZZO],
  ['t-bar', 'T-Bar', RUOLI.ATTREZZO],
  ['pull up bar', 'Sbarra', RUOLI.ATTREZZO],
  ['kettlebell', 'Kettlebell', RUOLI.ATTREZZO],
  ['dumbbell', 'Manubri', RUOLI.ATTREZZO],
  ['dummbell', 'Manubri', RUOLI.ATTREZZO],   // refuso presente nel catalogo
  ['barbell', 'Bilanciere', RUOLI.ATTREZZO],
  ['clubbell', 'Clubbell', RUOLI.ATTREZZO],
  ['macebell', 'Macebell', RUOLI.ATTREZZO],
  ['sandbag', 'Sandbag', RUOLI.ATTREZZO],
  ['landmine', 'Landmine', RUOLI.ATTREZZO],
  ['superband', 'Superband', RUOLI.ATTREZZO],
  ['miniband', 'Miniband', RUOLI.ATTREZZO],
  ['suspension', 'Suspension', RUOLI.ATTREZZO],
  ['parallette', 'Parallette', RUOLI.ATTREZZO],
  ['bodyweight', 'a Corpo Libero', RUOLI.ATTREZZO],
  ['slider', 'Slider', RUOLI.ATTREZZO],
  ['cable', 'Cavo', RUOLI.ATTREZZO],
  ['sled', 'Slitta', RUOLI.ATTREZZO],
  ['tire', 'Pneumatico', RUOLI.ATTREZZO],
  ['sledge', 'Mazza', RUOLI.ATTREZZO],
  ['ring', 'Anelli', RUOLI.ATTREZZO],
  ['rope', 'Corda', RUOLI.ATTREZZO],
  ['band', 'Elastico', RUOLI.ATTREZZO],
  ['plate', 'Disco', RUOLI.ATTREZZO],
  ['machine', 'Macchina', RUOLI.ATTREZZO],
  ['bench', 'Panca', RUOLI.ATTREZZO],
  ['box', 'Box', RUOLI.ATTREZZO],
  ['wall', 'al Muro', RUOLI.ATTREZZO],
  ['floor', 'a Terra', RUOLI.ATTREZZO],
  ['bar', 'Sbarra', RUOLI.ATTREZZO],

  // ---------- Posizione ----------
  ['half kneeling', 'in Ginocchio', RUOLI.POSIZIONE],
  ['tall kneeling', 'in Ginocchio Eretto', RUOLI.POSIZIONE],
  ['staggered stance', 'a Passo Sfalsato', RUOLI.POSIZIONE],
  ['split stance', 'a Gambe Divaricate', RUOLI.POSIZIONE],
  ['front rack', 'in Front Rack', RUOLI.POSIZIONE],
  ['bottoms up', 'Bottoms Up', RUOLI.POSIZIONE],
  ['bent over', 'Piegato in Avanti', RUOLI.POSIZIONE],
  ['feet elevated', 'con Piedi Rialzati', RUOLI.POSIZIONE],
  ['foot elevated', 'con Piede Rialzato', RUOLI.POSIZIONE],
  ['elevated', 'Rialzato', RUOLI.POSIZIONE],
  ['kneeling', 'in Ginocchio', RUOLI.POSIZIONE],
  ['standing', 'in Piedi', RUOLI.POSIZIONE],
  ['seated', 'da Seduto', RUOLI.POSIZIONE],
  ['supine', 'Supino', RUOLI.POSIZIONE],
  ['prone', 'Prono', RUOLI.POSIZIONE],
  ['lying', 'Sdraiato', RUOLI.POSIZIONE],
  ['hanging', 'alla Sbarra', RUOLI.POSIZIONE],
  ['incline', 'su Panca Inclinata', RUOLI.POSIZIONE],
  ['decline', 'su Panca Declinata', RUOLI.POSIZIONE],
  ['overhead', 'Overhead', RUOLI.POSIZIONE],
  ['goblet', 'Goblet', RUOLI.POSIZIONE],
  ['zercher', 'Zercher', RUOLI.POSIZIONE],
  ['suitcase', 'Suitcase', RUOLI.POSIZIONE],
  ['quadruped', 'Quadrupedia', RUOLI.POSIZIONE],
  ['side', 'Laterale', RUOLI.POSIZIONE],
  ['inverted', 'Inverso', RUOLI.POSIZIONE],
  ['freestanding', 'Libero', RUOLI.POSIZIONE],

  // ---------- Variante / esecuzione ----------
  ['high to low', 'dall\'Alto al Basso', RUOLI.VARIANTE],
  ['low to high', 'dal Basso in Alto', RUOLI.VARIANTE],
  ['alternating', 'Alternato', RUOLI.VARIANTE],
  ['contralateral', 'Controlaterale', RUOLI.VARIANTE],
  ['ipsilateral', 'Omolaterale', RUOLI.VARIANTE],
  ['isometric', 'Isometrico', RUOLI.VARIANTE],
  ['eccentric', 'Eccentrico', RUOLI.VARIANTE],
  ['plyometric', 'Pliometrico', RUOLI.VARIANTE],
  ['ballistic', 'Balistico', RUOLI.VARIANTE],
  ['assisted', 'Assistito', RUOLI.VARIANTE],
  ['resisted', 'Contrastato', RUOLI.VARIANTE],
  ['supported', 'con Appoggio', RUOLI.VARIANTE],
  ['chest-supported', 'con Petto in Appoggio', RUOLI.VARIANTE],
  ['close grip', 'Presa Stretta', RUOLI.VARIANTE],
  ['wide grip', 'Presa Larga', RUOLI.VARIANTE],
  ['neutral grip', 'Presa Neutra', RUOLI.VARIANTE],
  ['false grip', 'Presa False', RUOLI.VARIANTE],
  ['fingertip', 'sulle Dita', RUOLI.VARIANTE],
  ['single leg', 'a Una Gamba', RUOLI.VARIANTE],
  ['single arm', 'a Un Braccio', RUOLI.VARIANTE],
  ['straight leg', 'a Gamba Tesa', RUOLI.VARIANTE],
  ['bent knee', 'a Ginocchio Flesso', RUOLI.VARIANTE],
  ['strict', 'Stretto', RUOLI.VARIANTE],
  ['pause', 'con Pausa', RUOLI.VARIANTE],
  ['deficit', 'in Deficit', RUOLI.VARIANTE],
  ['tempo', 'a Tempo', RUOLI.VARIANTE],
  ['reverse', 'Inverso', RUOLI.VARIANTE],
  ['external', 'Esterna', RUOLI.VARIANTE],
  ['internal', 'Interna', RUOLI.VARIANTE],
  ['lateral', 'Laterale', RUOLI.VARIANTE],
  ['frontal', 'Frontale', RUOLI.VARIANTE],
  ['rotational', 'Rotazionale', RUOLI.VARIANTE],
  ['offset', 'Sbilanciato', RUOLI.VARIANTE],
  ['staggered', 'Sfalsato', RUOLI.VARIANTE],
  ['walking', 'in Camminata', RUOLI.VARIANTE],
  ['jumping', 'con Salto', RUOLI.VARIANTE],
  ['seesaw', 'Alternato a Bilanciere', RUOLI.VARIANTE],
  ['heavy', 'Pesante', RUOLI.VARIANTE],
  ['wide', 'Largo', RUOLI.VARIANTE],
  ['narrow', 'Stretto', RUOLI.VARIANTE],
  ['half', 'a Metà', RUOLI.VARIANTE],
  ['full', 'Completo', RUOLI.VARIANTE],
  ['double', 'Doppio', RUOLI.VARIANTE],
  ['single', 'Singolo', RUOLI.VARIANTE],
  ['low', 'Basso', RUOLI.VARIANTE],
  ['high', 'Alto', RUOLI.VARIANTE],
  ['front', 'Frontale', RUOLI.VARIANTE],
  ['back', 'Posteriore', RUOLI.VARIANTE],
  ['inside', 'Interno', RUOLI.VARIANTE],
  ['outside', 'Esterno', RUOLI.VARIANTE],
  ['inner', 'Interno', RUOLI.VARIANTE],
  ['outer', 'Esterno', RUOLI.VARIANTE],
  ['mid', 'Medio', RUOLI.VARIANTE],
  ['advanced', 'Avanzato', RUOLI.VARIANTE],
  ['tactical', 'Tattico', RUOLI.VARIANTE],
  ['strap', 'con Straps', RUOLI.VARIANTE],

  // ---------- Movimenti ----------
  ['turkish get up', 'Turkish Get Up', RUOLI.MOVIMENTO],
  ['get up', 'Get Up', RUOLI.MOVIMENTO],
  ['get-up', 'Get Up', RUOLI.MOVIMENTO],
  ['romanian deadlift', 'Stacco Rumeno', RUOLI.MOVIMENTO],
  ['conventional deadlift', 'Stacco Classico', RUOLI.MOVIMENTO],
  ['sumo deadlift', 'Stacco Sumo', RUOLI.MOVIMENTO],
  ['stiff leg deadlift', 'Stacco a Gambe Tese', RUOLI.MOVIMENTO],
  ['deadlift', 'Stacco', RUOLI.MOVIMENTO],
  ['good morning', 'Good Morning', RUOLI.MOVIMENTO],
  ['hip thrust', 'Hip Thrust', RUOLI.MOVIMENTO],
  ['glute bridge', 'Ponte per Glutei', RUOLI.MOVIMENTO],
  ['bridge', 'Ponte', RUOLI.MOVIMENTO],
  ['bulgarian split squat', 'Squat Bulgaro', RUOLI.MOVIMENTO],
  ['split squat', 'Split Squat', RUOLI.MOVIMENTO],
  ['cossack squat', 'Cossack Squat', RUOLI.MOVIMENTO],
  ['pistol squat', 'Pistol Squat', RUOLI.MOVIMENTO],
  ['sissy squat', 'Sissy Squat', RUOLI.MOVIMENTO],
  ['hack squat', 'Hack Squat', RUOLI.MOVIMENTO],
  ['squat', 'Squat', RUOLI.MOVIMENTO],
  ['curtsy lunge', 'Affondo Incrociato', RUOLI.MOVIMENTO],
  ['reverse lunge', 'Affondo all\'Indietro', RUOLI.MOVIMENTO],
  ['forward lunge', 'Affondo in Avanti', RUOLI.MOVIMENTO],
  ['lateral lunge', 'Affondo Laterale', RUOLI.MOVIMENTO],
  ['lunge', 'Affondo', RUOLI.MOVIMENTO],
  ['step up', 'Step Up', RUOLI.MOVIMENTO],
  ['calf raise', 'Calf Raise', RUOLI.MOVIMENTO],
  ['leg curl', 'Leg Curl', RUOLI.MOVIMENTO],
  ['leg extension', 'Leg Extension', RUOLI.MOVIMENTO],
  ['leg press', 'Leg Press', RUOLI.MOVIMENTO],
  ['nordic curl', 'Nordic Curl', RUOLI.MOVIMENTO],
  ['hamstring curl', 'Leg Curl', RUOLI.MOVIMENTO],
  ['bench press', 'Distensioni su Panca', RUOLI.MOVIMENTO],
  ['chest press', 'Chest Press', RUOLI.MOVIMENTO],
  ['shoulder press', 'Distensioni sopra la Testa', RUOLI.MOVIMENTO],
  ['military press', 'Military Press', RUOLI.MOVIMENTO],
  ['arnold press', 'Arnold Press', RUOLI.MOVIMENTO],
  ['z press', 'Z Press', RUOLI.MOVIMENTO],
  ['push press', 'Push Press', RUOLI.MOVIMENTO],
  ['floor press', 'Floor Press', RUOLI.MOVIMENTO],
  ['pallof press', 'Pallof Press', RUOLI.MOVIMENTO],
  ['press', 'Distensioni', RUOLI.MOVIMENTO],
  ['push up', 'Piegamenti', RUOLI.MOVIMENTO],
  ['push-up', 'Piegamenti', RUOLI.MOVIMENTO],
  ['pseudo planche', 'Pseudo Planche', RUOLI.MOVIMENTO],
  ['planche', 'Planche', RUOLI.MOVIMENTO],
  ['handstand', 'Verticale', RUOLI.MOVIMENTO],
  ['pull up', 'Trazioni', RUOLI.MOVIMENTO],
  ['chin up', 'Trazioni Presa Supina', RUOLI.MOVIMENTO],
  ['muscle up', 'Muscle Up', RUOLI.MOVIMENTO],
  ['lat pulldown', 'Lat Machine', RUOLI.MOVIMENTO],
  ['pulldown', 'Lat Machine', RUOLI.MOVIMENTO],
  ['pullover', 'Pullover', RUOLI.MOVIMENTO],
  ['pendlay row', 'Pendlay Row', RUOLI.MOVIMENTO],
  ['meadows row', 'Meadows Row', RUOLI.MOVIMENTO],
  ['renegade row', 'Renegade Row', RUOLI.MOVIMENTO],
  ['row', 'Rematore', RUOLI.MOVIMENTO],
  ['face pull', 'Face Pull', RUOLI.MOVIMENTO],
  ['shrug', 'Scrollate', RUOLI.MOVIMENTO],
  ['bicep curl', 'Curl per Bicipiti', RUOLI.MOVIMENTO],
  ['hammer curl', 'Curl a Martello', RUOLI.MOVIMENTO],
  ['spider curl', 'Spider Curl', RUOLI.MOVIMENTO],
  ['preacher curl', 'Curl su Panca Scott', RUOLI.MOVIMENTO],
  ['concentration curl', 'Curl di Concentrazione', RUOLI.MOVIMENTO],
  ['zottman curl', 'Zottman Curl', RUOLI.MOVIMENTO],
  ['curl', 'Curl', RUOLI.MOVIMENTO],
  ['skull crusher', 'French Press', RUOLI.MOVIMENTO],
  ['tricep extension', 'Estensioni per Tricipiti', RUOLI.MOVIMENTO],
  ['tricep pushdown', 'Pushdown per Tricipiti', RUOLI.MOVIMENTO],
  ['pushdown', 'Pushdown', RUOLI.MOVIMENTO],
  ['kickback', 'Kickback', RUOLI.MOVIMENTO],
  ['dips', 'Dip alle Parallele', RUOLI.MOVIMENTO],
  ['dip', 'Dip', RUOLI.MOVIMENTO],
  ['lateral raise', 'Alzate Laterali', RUOLI.MOVIMENTO],
  ['front raise', 'Alzate Frontali', RUOLI.MOVIMENTO],
  ['reverse fly', 'Aperture Inverse', RUOLI.MOVIMENTO],
  ['fly', 'Croci', RUOLI.MOVIMENTO],
  ['raise', 'Alzate', RUOLI.MOVIMENTO],
  ['extension', 'Estensioni', RUOLI.MOVIMENTO],
  ['extensions', 'Estensioni', RUOLI.MOVIMENTO],
  ['rotation', 'Rotazione', RUOLI.MOVIMENTO],
  ['rotations', 'Rotazioni', RUOLI.MOVIMENTO],
  ['abduction', 'Abduzione', RUOLI.MOVIMENTO],
  ['adduction', 'Adduzione', RUOLI.MOVIMENTO],
  ['flexion', 'Flessione', RUOLI.MOVIMENTO],
  ['hyperextension', 'Hyperextension', RUOLI.MOVIMENTO],
  ['crunch', 'Crunch', RUOLI.MOVIMENTO],
  ['sit up', 'Sit Up', RUOLI.MOVIMENTO],
  ['plank', 'Plank', RUOLI.MOVIMENTO],
  ['hollow hold', 'Hollow Hold', RUOLI.MOVIMENTO],
  ['dead bug', 'Dead Bug', RUOLI.MOVIMENTO],
  ['bird dog', 'Bird Dog', RUOLI.MOVIMENTO],
  ['mountain climber', 'Mountain Climber', RUOLI.MOVIMENTO],
  ['knee raise', 'Sollevamento Ginocchia', RUOLI.MOVIMENTO],
  ['leg raise', 'Sollevamento Gambe', RUOLI.MOVIMENTO],
  ['toe touch', 'Toe Touch', RUOLI.MOVIMENTO],
  ['flutter kicks', 'Flutter Kicks', RUOLI.MOVIMENTO],
  ['windshield wiper', 'Windshield Wiper', RUOLI.MOVIMENTO],
  ['russian twist', 'Russian Twist', RUOLI.MOVIMENTO],
  ['twist', 'Torsione', RUOLI.MOVIMENTO],
  ['chop', 'Chop', RUOLI.MOVIMENTO],
  ['rollout', 'Rollout', RUOLI.MOVIMENTO],
  ['woodchop', 'Woodchop', RUOLI.MOVIMENTO],
  ['clamshell', 'Clamshell', RUOLI.MOVIMENTO],
  ['fire hydrant', 'Fire Hydrant', RUOLI.MOVIMENTO],
  ['swing', 'Swing', RUOLI.MOVIMENTO],
  ['snatch', 'Snatch', RUOLI.MOVIMENTO],
  ['clean', 'Clean', RUOLI.MOVIMENTO],
  ['jerk', 'Jerk', RUOLI.MOVIMENTO],
  ['thruster', 'Thruster', RUOLI.MOVIMENTO],
  ['burpee', 'Burpee', RUOLI.MOVIMENTO],
  ['burpees', 'Burpees', RUOLI.MOVIMENTO],
  ['windmill', 'Windmill', RUOLI.MOVIMENTO],
  ['halo', 'Halo', RUOLI.MOVIMENTO],
  ['mill', 'Mill', RUOLI.MOVIMENTO],
  ['carry', 'Camminata', RUOLI.MOVIMENTO],
  ['farmer walk', 'Farmer Walk', RUOLI.MOVIMENTO],
  ['walk', 'Camminata', RUOLI.MOVIMENTO],
  ['march', 'Marcia', RUOLI.MOVIMENTO],
  ['jump', 'Salto', RUOLI.MOVIMENTO],
  ['broad jump', 'Salto in Lungo', RUOLI.MOVIMENTO],
  ['box jump', 'Box Jump', RUOLI.MOVIMENTO],
  ['slam', 'Slam', RUOLI.MOVIMENTO],
  ['toss', 'Lancio', RUOLI.MOVIMENTO],
  ['hold', 'Tenuta', RUOLI.MOVIMENTO],
  ['hang', 'Sospensione', RUOLI.MOVIMENTO],
  ['crawl', 'Camminata a Terra', RUOLI.MOVIMENTO],
  ['climb', 'Salita', RUOLI.MOVIMENTO],
  ['slide', 'Scivolata', RUOLI.MOVIMENTO],
  ['circle', 'Circonduzioni', RUOLI.MOVIMENTO],
  ['circles', 'Circonduzioni', RUOLI.MOVIMENTO],
  ['scaption', 'Scaption', RUOLI.MOVIMENTO],
  ['dislocates', 'Dislocazioni', RUOLI.MOVIMENTO],

  // ---------- Parti del corpo (seguono il movimento) ----------
  ['shoulder external rotation', 'Rotazione Esterna della Spalla', RUOLI.MOVIMENTO],
  ['shoulder internal rotation', 'Rotazione Interna della Spalla', RUOLI.MOVIMENTO],
  ['hip abduction', 'Abduzione dell\'Anca', RUOLI.MOVIMENTO],
  ['hip adduction', 'Adduzione dell\'Anca', RUOLI.MOVIMENTO],
  ['hip extension', 'Estensione dell\'Anca', RUOLI.MOVIMENTO],
  ['shoulder', 'della Spalla', RUOLI.PARTE],
  ['hip', 'dell\'Anca', RUOLI.PARTE],
  ['knee over toe', 'Ginocchio Oltre la Punta', RUOLI.VARIANTE],
  ['knee', 'del Ginocchio', RUOLI.PARTE],
  ['ankle', 'della Caviglia', RUOLI.PARTE],
  ['wrist', 'del Polso', RUOLI.PARTE],
  ['wrists', 'dei Polsi', RUOLI.PARTE],
  ['elbow', 'del Gomito', RUOLI.PARTE],
  ['elbows', 'dei Gomiti', RUOLI.PARTE],
  ['glute', 'per Glutei', RUOLI.PARTE],
  ['calf', 'per Polpacci', RUOLI.PARTE],
  ['bicep', 'per Bicipiti', RUOLI.PARTE],
  ['tricep', 'per Tricipiti', RUOLI.PARTE],
  ['hamstring', 'per Femorali', RUOLI.PARTE],
  ['tibialis', 'per Tibiale', RUOLI.PARTE],
  ['forearm', 'per Avambracci', RUOLI.PARTE],
  ['thigh', 'per Cosce', RUOLI.PARTE],
  ['shin', 'per Stinchi', RUOLI.PARTE],
  ['scapular', 'Scapolare', RUOLI.PARTE],
  ['oblique', 'per Obliqui', RUOLI.PARTE],
  ['chest', 'per Petto', RUOLI.PARTE],
  ['ab', 'per Addominali', RUOLI.PARTE],
  ['lat', 'per Dorsali', RUOLI.PARTE],
  ['trap', 'per Trapezi', RUOLI.PARTE],
  ['leg', 'Gambe', RUOLI.PARTE],
  ['legs', 'Gambe', RUOLI.PARTE],
  ['arm', 'Braccia', RUOLI.PARTE],
  ['body', 'Corpo', RUOLI.PARTE],

  // ---------- Prese ----------
  ['horn grip', 'Presa alle Corna', RUOLI.VARIANTE],
  ['crush grip', 'Presa a Schiacciamento', RUOLI.VARIANTE],
  ['mixed grip', 'Presa Mista', RUOLI.VARIANTE],
  ['hook grip', 'Hook Grip', RUOLI.VARIANTE],
  ['grip', 'Presa', RUOLI.VARIANTE],

  // ---------- Termini tecnici aggiunti in seconda passata ----------
  ['back rack', 'in Back Rack', RUOLI.POSIZIONE],
  ['rack', 'in Rack', RUOLI.POSIZIONE],
  ['order', 'Order', RUOLI.VARIANTE],
  ['cyclist squat', 'Cyclist Squat', RUOLI.MOVIMENTO],
  ['cyclist', 'Cyclist', RUOLI.VARIANTE],
  ['back lever', 'Back Lever', RUOLI.MOVIMENTO],
  ['front lever', 'Front Lever', RUOLI.MOVIMENTO],
  ['lever', 'Lever', RUOLI.MOVIMENTO],
  ['shield cast', 'Shield Cast', RUOLI.MOVIMENTO],
  ['cast', 'Cast', RUOLI.MOVIMENTO],
  ['shield', 'Shield', RUOLI.MOVIMENTO],
  ['sit up', 'Sit Up', RUOLI.MOVIMENTO],
  ['sit-up', 'Sit Up', RUOLI.MOVIMENTO],
  ['sit', 'Sit', RUOLI.MOVIMENTO],
  ['toe touch', 'Toe Touch', RUOLI.MOVIMENTO],
  ['toes', 'Punte', RUOLI.PARTE],
  ['toe', 'Punta', RUOLI.PARTE],
  ['dead hang', 'Dead Hang', RUOLI.MOVIMENTO],
  ['dead stop', 'Dead Stop', RUOLI.VARIANTE],
  ['dead', 'Dead', RUOLI.MOVIMENTO],
  ['start stop', 'Start Stop', RUOLI.VARIANTE],
  ['start', 'Start', RUOLI.VARIANTE],
  ['stop', 'Stop', RUOLI.VARIANTE],
  ['switch', 'con Cambio', RUOLI.VARIANTE],
  ['power clean', 'Power Clean', RUOLI.MOVIMENTO],
  ['power snatch', 'Power Snatch', RUOLI.MOVIMENTO],
  ['power', 'Power', RUOLI.VARIANTE],
  ['split jerk', 'Split Jerk', RUOLI.MOVIMENTO],
  ['split', 'Split', RUOLI.VARIANTE],
  ['bag', 'Sacco', RUOLI.ATTREZZO],
  ['club', 'Clubbell', RUOLI.ATTREZZO],
  ['ball', 'Palla', RUOLI.ATTREZZO],
  ['wheel', 'Ruota', RUOLI.ATTREZZO],
  ['bike', 'Cyclette', RUOLI.ATTREZZO],
  ['rower', 'Vogatore', RUOLI.ATTREZZO],
  ['stepper', 'Stepper', RUOLI.ATTREZZO],
  ['hollow body', 'Hollow Body', RUOLI.MOVIMENTO],
  ['hollow', 'Hollow', RUOLI.MOVIMENTO],
  ['bear hug', 'Bear Hug', RUOLI.POSIZIONE],
  ['hug', 'Abbraccio', RUOLI.POSIZIONE],
  ['waiter', 'Waiter', RUOLI.POSIZIONE],
  ['straight arm', 'a Braccia Tese', RUOLI.VARIANTE],
  ['straight', 'Teso', RUOLI.VARIANTE],
  ['bent', 'Piegato', RUOLI.VARIANTE],
  ['pendulum', 'Pendolo', RUOLI.MOVIMENTO],
  ['hand', 'Mano', RUOLI.PARTE],
  ['hands', 'Mani', RUOLI.PARTE],
  ['flag', 'Flag', RUOLI.MOVIMENTO],
  ['archer', 'Archer', RUOLI.VARIANTE],
  ['pump', 'Pump', RUOLI.MOVIMENTO],
  ['wave', 'Onde', RUOLI.MOVIMENTO],
  ['rock climbing', 'Rock Climbing', RUOLI.MOVIMENTO],
  ['climbing', 'Climbing', RUOLI.MOVIMENTO],
  ['climber', 'Climber', RUOLI.MOVIMENTO],
  ['world', 'World', RUOLI.VARIANTE],
  ['barbarian', 'Barbarian', RUOLI.VARIANTE],
  ['reach', 'Allungo', RUOLI.MOVIMENTO],
  ['cross body', 'Incrociato', RUOLI.VARIANTE],
  ['cross', 'Incrociato', RUOLI.VARIANTE],
  ['pivot', 'Pivot', RUOLI.VARIANTE],
  ['balance', 'Equilibrio', RUOLI.MOVIMENTO],
  ['pass', 'Passaggio', RUOLI.MOVIMENTO],
  ['heart', 'Heart', RUOLI.VARIANTE],
  ['shaped', 'a Forma di', RUOLI.VARIANTE],
  ['iron cross', 'Iron Cross', RUOLI.MOVIMENTO],
  ['iron', 'Iron', RUOLI.VARIANTE],
  ['saw', 'Sega', RUOLI.MOVIMENTO],
  ['hover', 'Sospeso', RUOLI.VARIANTE],
  ['swipe', 'Swipe', RUOLI.MOVIMENTO],
  ['kick', 'Calcio', RUOLI.MOVIMENTO],
  ['kicks', 'Calci', RUOLI.MOVIMENTO],
  ['knees', 'Ginocchia', RUOLI.PARTE],
  ['lay', 'Disteso', RUOLI.POSIZIONE],
  ['catch', 'Presa al Volo', RUOLI.MOVIMENTO],
  ['drag', 'Trascinamento', RUOLI.MOVIMENTO],
  ['park', 'Park', RUOLI.VARIANTE],
  ['walkout', 'Walkout', RUOLI.MOVIMENTO],
  ['roll', 'Rullo', RUOLI.MOVIMENTO],
  ['rolling', 'Rotolamento', RUOLI.MOVIMENTO],
  ['push', 'Spinta', RUOLI.MOVIMENTO],
  ['pull', 'Tirata', RUOLI.MOVIMENTO],
  ['pullout', 'Pullout', RUOLI.MOVIMENTO],
  ['crush', 'Schiacciamento', RUOLI.VARIANTE],
  ['transfer', 'Passaggio', RUOLI.MOVIMENTO],
  ['angels', 'Angels', RUOLI.MOVIMENTO],
  ['taps', 'Tocchi', RUOLI.MOVIMENTO],
  ['tap', 'Tocco', RUOLI.MOVIMENTO],
  ['stir the pot', 'Stir the Pot', RUOLI.MOVIMENTO],
  ['face', 'Face', RUOLI.VARIANTE],
  ['incline bench', 'su Panca Inclinata', RUOLI.POSIZIONE],
  ['decline bench', 'su Panca Declinata', RUOLI.POSIZIONE],
  ['flat bench', 'su Panca Piana', RUOLI.POSIZIONE],
  ['parallel bars', 'alle Parallele', RUOLI.ATTREZZO],
  ['parallele', 'alle Parallele', RUOLI.ATTREZZO],
  ['pec deck', 'Pec Deck', RUOLI.MOVIMENTO],
  ['nordic', 'Nordic', RUOLI.VARIANTE],
  ['hammer', 'a Martello', RUOLI.VARIANTE],
  ['feet', 'Piedi', RUOLI.PARTE],
  ['foot', 'Piede', RUOLI.PARTE],
  ['finger', 'Dita', RUOLI.PARTE],
  ['sternum', 'allo Sterno', RUOLI.VARIANTE],
  ['skin the cat', 'Skin the Cat', RUOLI.MOVIMENTO],
  ['dive bomber', 'Dive Bomber', RUOLI.MOVIMENTO],
  ['bicycle', 'Bicycle', RUOLI.MOVIMENTO],
  ['diamond', 'Diamante', RUOLI.VARIANTE],
  ['steering wheel', 'Steering Wheel', RUOLI.MOVIMENTO],
  ['airplane', 'Airplane', RUOLI.MOVIMENTO],
  ['jumping jack', 'Jumping Jack', RUOLI.MOVIMENTO],
  ['battle ropes', 'Battle Rope', RUOLI.ATTREZZO],
  ['outward', 'verso l\'Esterno', RUOLI.VARIANTE],
  ['inward', 'verso l\'Interno', RUOLI.VARIANTE],
  ['facing', 'Rivolto', RUOLI.VARIANTE],
  ['apart', 'Divaricato', RUOLI.VARIANTE],
  ['two', 'Due', RUOLI.VARIANTE],
  ['clap', 'con Battito', RUOLI.VARIANTE],
  ['whip', 'Whip', RUOLI.MOVIMENTO],
  ['spin', 'Rotazione', RUOLI.MOVIMENTO],
  ['lift', 'Sollevamento', RUOLI.MOVIMENTO],
  ['top', 'Alto', RUOLI.VARIANTE],
  ['dive', 'Dive', RUOLI.MOVIMENTO],
  ['bomber', 'Bomber', RUOLI.VARIANTE],
  ['cha', 'Cha', RUOLI.VARIANTE],

  // Rete di sicurezza: in palestra questi si dicono identici all'inglese
  ['french press', 'French Press', RUOLI.MOVIMENTO],
  ['lat machine', 'Lat Machine', RUOLI.MOVIMENTO],
  ['chest press', 'Chest Press', RUOLI.MOVIMENTO],
  ['shoulder press machine', 'Shoulder Press Machine', RUOLI.MOVIMENTO],
];

// Termini che restano identici: nomi propri, gergo internazionale, lettere.
const INVARIATI = new Set([
  'cuban', 'turkish', 'russian', 'bulgarian', 'copenhagen', 'indian', 'german',
  'hawaiian', 'arnold', 'zottman', 'pendlay', 'meadows', 'pallof', 'cossack',
  'zercher', 'goblet', 'sots', 'otis', 'powell', 'kang', 'lu', 'gironda',
  'bayesian', 'spider', 'skater', 'cobra', 'shrimp', 'dragon', 'frog', 'bear',
  'crow', 'gorilla', 'duck', 'horse', 'bull', 'cat', 'beast', 'monster',
  'devil', 'zombie', 'commando', 'gunslinger', 'shotgun', 'guillotine',
  'maltese', 'manna', 'stalder', 'pelican', 'cocoon', 'candlestick', 'aztec',
  'atomic', 'chaos', 'gamma', 'torch', 'pike', 'straddle', 'tuck', 'l', 'v',
  'y', 'z', 'w', 'j', 's', 'ys', 'ts', 'x',
]);

const ORDINE = [RUOLI.MOVIMENTO, RUOLI.PARTE, RUOLI.VARIANTE, RUOLI.POSIZIONE, RUOLI.ATTREZZO];

// Indice per lunghezza decrescente: garantisce il match più lungo per primo
const INDICE = [...TERMINI].sort((a, b) => b[0].split(' ').length - a[0].split(' ').length);
const MAX_PAROLE = Math.max(...INDICE.map(t => t[0].split(' ').length));

const maiuscola = (p) => p.charAt(0).toUpperCase() + p.slice(1);

/**
 * Traduce un nome di esercizio dall'inglese all'italiano.
 * @returns {{ nomeIt: string|null, copertura: number, nonTradotti: string[] }}
 *   copertura = quota di parole riconosciute; nomeIt è null se troppo bassa.
 */
// Marcatori inequivocabili di un nome già in italiano: quei 27 esercizi
// vanno lasciati stare, non "tradotti" una seconda volta.
const MARCATORI_ITALIANI = /\b(con|ai|alla|alle|della|dello|dei|delle|su|da|il|la|lo|le|un|una|bilanciere|manubri|manubrio|panca|cavi|cavo|sbarra|piegamenti|affondi|alzate|croci|stacco|rematore|trazioni|estensioni|distensioni|tirate|polpacci|gambe|piedi|testa|terra|sessione|cyclette|vogatore|ellittica|tapis)\b/i;

// Gli esercizi fino a questo id sono il catalogo curato a mano: già in
// italiano, e spesso già bilingui con l'inglese fra parentesi
// ("Lat Machine (Lat Pulldown)"). Vanno lasciati intatti.
export const ULTIMO_ID_CATALOGO_CURATO = 60;

/** true se il nome è già italiano e non va tradotto. */
export function eGiaItaliano(nome) {
  const base = nome.replace(/\([^)]*\)/g, ' ');
  return MARCATORI_ITALIANI.test(base);
}

export function traduciNomeEsercizio(nome) {
  if (eGiaItaliano(nome)) return { nomeIt: null, copertura: 1, nonTradotti: [], giaItaliano: true };

  // La parte fra parentesi è già una glossa: la si conserva così com'è
  const conParentesi = nome.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  const base = (conParentesi ? conParentesi[1] : nome).trim();
  const glossa = conParentesi ? conParentesi[2].trim() : null;

  const parole = base.split(/\s+/).filter(Boolean);
  const perRuolo = { [RUOLI.MOVIMENTO]: [], [RUOLI.PARTE]: [], [RUOLI.VARIANTE]: [], [RUOLI.POSIZIONE]: [], [RUOLI.ATTREZZO]: [] };
  const nonTradotti = [];
  let riconosciute = 0;

  let i = 0;
  while (i < parole.length) {
    let trovato = null;

    for (let lunghezza = Math.min(MAX_PAROLE, parole.length - i); lunghezza >= 1 && !trovato; lunghezza--) {
      const frase = parole.slice(i, i + lunghezza).join(' ').toLowerCase().replace(/[^a-zà-ÿ0-9\s'-]/g, '');
      const voce = INDICE.find(t => t[0] === frase && t[0].split(' ').length === lunghezza);
      if (voce) trovato = { voce, lunghezza };
    }

    if (trovato) {
      perRuolo[trovato.voce[2]].push(trovato.voce[1]);
      riconosciute += trovato.lunghezza;
      i += trovato.lunghezza;
      continue;
    }

    const parola = parole[i];
    const pulita = parola.toLowerCase().replace(/[^a-zà-ÿ0-9'-]/g, '');

    if (INVARIATI.has(pulita) || /^\d+$/.test(pulita)) {
      // I nomi propri restano attaccati al movimento, dove danno significato
      perRuolo[RUOLI.MOVIMENTO].push(maiuscola(parola));
      riconosciute++;
    } else if (['to', 'and', 'the', 'with', 'in', 'on', 'a', 'of', 'up', 'out', 'over', 'through', 'around', 'down', 'off'].includes(pulita)) {
      // Particelle: non contano né come tradotte né come mancanti
      perRuolo[RUOLI.MOVIMENTO].push(parola.toLowerCase());
    } else {
      perRuolo[RUOLI.MOVIMENTO].push(parola);
      nonTradotti.push(parola);
    }
    i++;
  }

  const significative = parole.filter(p => {
    const c = p.toLowerCase().replace(/[^a-zà-ÿ0-9'-]/g, '');
    return !['to', 'and', 'the', 'with', 'in', 'on', 'a', 'of', 'up', 'out', 'over', 'through', 'around', 'down', 'off'].includes(c);
  }).length;

  const copertura = significative === 0 ? 1 : riconosciute / significative;

  // Deduplica: "Bar Hanging Knee Raise" produrrebbe "alla Sbarra … con Sbarra"
  const giaVisti = new Set();
  for (const ruolo of ORDINE) {
    perRuolo[ruolo] = perRuolo[ruolo].filter(v => {
      const k = v.toLowerCase().replace(/^(con |a |al |su |in |da |alla )/, '');
      if (giaVisti.has(k)) return false;
      giaVisti.add(k);
      return true;
    });
  }

  // Tutti i complementi introdotti da "con" confluiscono in uno solo:
  // "con Piede Rialzato con Due Manubri" diventa "con Piede Rialzato e Due
  // Manubri".
  const pezzi = [];
  const complementi = [];
  for (const ruolo of ORDINE) {
    if (perRuolo[ruolo].length === 0) continue;

    for (const voce of perRuolo[ruolo]) {
      if (/^con /i.test(voce)) {
        complementi.push(voce.replace(/^con /i, ''));
      } else if (ruolo === RUOLI.ATTREZZO) {
        // "a Corpo Libero", "a Terra", "al Muro" sono già locuzioni complete
        if (/^(a |al |su |in |alle )/i.test(voce)) pezzi.push(voce);
        else complementi.push(voce);
      } else {
        pezzi.push(voce);
      }
    }
  }
  if (complementi.length > 0) pezzi.push(`con ${complementi.join(' e ')}`);

  let risultato = pezzi.join(' ').replace(/\s+/g, ' ').trim();
  if (glossa) risultato += ` (${glossa})`;

  return { nomeIt: risultato || null, copertura, nonTradotti };
}
