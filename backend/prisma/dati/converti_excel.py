# ============================================
# GymMaster — Conversione Excel → JSON
# Converte il database "Functional Fitness Exercise Database v2.9"
# in formato JSON compatibile con lo schema Prisma
# ============================================

import openpyxl
import json
import os

# --- Configurazione ---
EXCEL_PATH = r'C:\Users\giova\Downloads\Functional+Fitness+Exercise+Database+(version+2.9).xlsx'
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Riga di inizio dati (0-indexed nell'array rows)
DATA_START_ROW = 16  # riga 17 nel foglio (0-indexed: 16)

# --- Mapping colonne (0-indexed) ---
COL = {
    'nome': 1,
    'video_demo': 2,       # Hyperlink
    'video_expl': 3,       # Hyperlink
    'difficulty': 4,
    'target_muscle': 5,
    'prime_mover': 6,
    'secondary_muscle': 7,
    'tertiary_muscle': 8,
    'equipment': 9,
    'posture': 13,
    'movement_pattern_1': 21,
    'movement_pattern_2': 22,
    'movement_pattern_3': 23,
    'body_region': 27,
    'force_type': 28,
    'mechanics': 29,
    'laterality': 30,
    'classification': 31,
}

# --- Mapping Gruppi Muscolari EN → IT ---
MUSCLE_GROUP_MAP = {
    'Quadriceps': 'Quadricipiti',
    'Shoulders': 'Spalle',
    'Abdominals': 'Addominali',
    'Back': 'Schiena',
    'Glutes': 'Glutei',
    'Chest': 'Petto',
    'Biceps': 'Bicipiti',
    'Triceps': 'Tricipiti',
    'Hip Flexors': "Flessori dell'Anca",
    'Calves': 'Polpacci',
    'Hamstrings': 'Femorali',
    'Forearms': 'Avambracci',
    'Abductors': 'Abduttori',
    'Adductors': 'Adduttori',
    'Trapezius': 'Trapezio',
    'Shins': 'Tibiali',
}

# --- Mapping Muscoli Specifici EN → IT ---
SPECIFIC_MUSCLE_MAP = {
    'Rectus Abdominis': 'Retto Addominale',
    'Obliques': 'Obliqui',
    'Rectus Femoris': 'Retto Femorale',
    'Gluteus Maximus': 'Grande Gluteo',
    'Gluteus Medius': 'Medio Gluteo',
    'Gluteus Minimus': 'Piccolo Gluteo',
    'Erector Spinae': 'Erettore Spinale',
    'Iliopsoas': 'Ileopsoas',
    'Pectoralis Major': 'Gran Pettorale',
    'Pectoralis Minor': 'Piccolo Pettorale',
    'Anterior Deltoids': 'Deltoide Anteriore',
    'Lateral Deltoids': 'Deltoide Laterale',
    'Posterior Deltoids': 'Deltoide Posteriore',
    'Biceps Brachii': 'Bicipite Brachiale',
    'Triceps Brachii': 'Tricipite Brachiale',
    'Latissimus Dorsi': 'Gran Dorsale',
    'Rhomboids': 'Romboidi',
    'Trapezius Upper': 'Trapezio Superiore',
    'Trapezius Middle': 'Trapezio Medio',
    'Trapezius Lower': 'Trapezio Inferiore',
    'Serratus Anterior': 'Dentato Anteriore',
    'Quadriceps': 'Quadricipiti',
    'Vastus Lateralis': 'Vasto Laterale',
    'Vastus Medialis': 'Vasto Mediale',
    'Vastus Intermedius': 'Vasto Intermedio',
    'Biceps Femoris': 'Bicipite Femorale',
    'Semitendinosus': 'Semitendinoso',
    'Semimembranosus': 'Semimembranoso',
    'Gastrocnemius': 'Gastrocnemio',
    'Soleus': 'Soleo',
    'Tibialis Anterior': 'Tibiale Anteriore',
    'Brachialis': 'Brachiale',
    'Brachioradialis': 'Brachioradiale',
    'Wrist Flexors': 'Flessori del Polso',
    'Wrist Extensors': 'Estensori del Polso',
    'Tensor Fasciae Latae': 'Tensore Fascia Lata',
    'Sartorius': 'Sartorio',
    'Gracilis': 'Gracile',
    'Pectineus': 'Pettineo',
    'Adductor Longus': 'Adduttore Lungo',
    'Adductor Magnus': 'Grande Adduttore',
    'Infraspinatus': 'Infraspinato',
    'Supraspinatus': 'Sovraspinato',
    'Teres Major': 'Grande Rotondo',
    'Teres Minor': 'Piccolo Rotondo',
    'Subscapularis': 'Sottoscapolare',
}

# --- Mapping Attrezzature EN → IT ---
EQUIPMENT_MAP = {
    'Barbell': 'Bilanciere Olimpico',
    'Dumbbell': 'Manubri (Set)',
    'Kettlebell': 'Kettlebell',
    'Bodyweight': None,  # Nessuna attrezzatura
    'Cable': 'Cavo Singolo Regolabile',
    'EZ Bar': 'Bilanciere EZ',
    'Pull Up Bar': 'Sbarra per Trazioni',
    'Trap Bar': 'Trap Bar (Hex Bar)',
    'Stability Ball': 'Palla di Stabilità',
    'Gymnastic Rings': 'Anelli Ginnici',
    'Resistance Band': 'Elastico di Resistenza',
    'Superband': 'Superband',
    'Miniband': 'Miniband',
    'Medicine Ball': 'Palla Medica',
    'Slam Ball': 'Slam Ball',
    'Wall Ball': 'Wall Ball',
    'Suspension Trainer': 'Suspension Trainer (TRX)',
    'Landmine': 'Landmine',
    'Parallette Bars': 'Parallele (Dip Station)',
    'Ab Wheel': 'Ab Wheel',
    'Battle Ropes': 'Battle Ropes',
    'Sandbag': 'Sandbag',
    'Heavy Sandbag': 'Sandbag Pesante',
    'Weight Plate': 'Disco (Peso)',
    'Sliders': 'Sliders',
    'Sled': 'Slitta (Sled)',
    'Tire': 'Pneumatico (Tire)',
    'Clubbell': 'Clubbell',
    'Macebell': 'Macebell',
    'Indian Club': 'Indian Club',
    'Bulgarian Bag': 'Bulgarian Bag',
    'Climbing Rope': 'Corda da Arrampicata',
}

# --- Mapping Difficulty EN → IT ---
DIFFICULTY_MAP = {
    'Beginner': 'Principiante',
    'Novice': 'Novizio',
    'Intermediate': 'Intermedio',
    'Advanced': 'Avanzato',
    'Expert': 'Esperto',
    'Master': 'Master',
    'Grand Master': 'Gran Master',
    'Legendary': 'Leggendario',
}

# --- Mapping Body Region EN → IT ---
BODY_REGION_MAP = {
    'Core': 'Core',
    'Upper Body': 'Parte Superiore',
    'Lower Body': 'Parte Inferiore',
    'Full Body': 'Tutto il Corpo',
}

# --- Mapping Mechanics EN → IT ---
MECHANICS_MAP = {
    'Compound': 'Composto',
    'Isolation': 'Isolamento',
}


def get_cell_value(row, col_idx):
    """Ottiene il valore di una cella, restituisce None se vuoto."""
    val = row[col_idx].value
    if val is None:
        return None
    return str(val).strip()


def get_hyperlink_url(ws, row_idx, col_idx):
    """Estrae URL hyperlink da una cella (1-indexed per openpyxl)."""
    cell = ws.cell(row=row_idx, column=col_idx + 1)  # openpyxl è 1-indexed
    if cell.hyperlink and cell.hyperlink.target:
        return cell.hyperlink.target
    return None


def translate_muscle(muscle_en):
    """Traduce un muscolo specifico EN → IT."""
    if not muscle_en:
        return None
    return SPECIFIC_MUSCLE_MAP.get(muscle_en, muscle_en)


def main():
    print("📂 Apertura file Excel...")
    wb = openpyxl.load_workbook(EXCEL_PATH)
    ws = wb['Exercises']
    
    # Leggi tutte le righe (per accesso indicizzato)
    rows = list(ws.rows)
    total_rows = len(rows) - DATA_START_ROW
    print(f"📊 Righe dati trovate: {total_rows}")
    
    esercizi = []
    attrezzature_set = set()
    skipped = 0
    video_count = 0
    
    for i, row in enumerate(rows[DATA_START_ROW:], DATA_START_ROW):
        nome = get_cell_value(row, COL['nome'])
        if not nome:
            skipped += 1
            continue
        
        # --- Gruppo muscolare primario ---
        target_muscle_en = get_cell_value(row, COL['target_muscle'])
        gruppo_primario = MUSCLE_GROUP_MAP.get(target_muscle_en, target_muscle_en) if target_muscle_en else 'Altro'
        
        # --- Muscoli secondario e terziario ---
        secondary_en = get_cell_value(row, COL['secondary_muscle'])
        tertiary_en = get_cell_value(row, COL['tertiary_muscle'])
        
        muscoli_secondari = []
        if secondary_en:
            muscoli_secondari.append(translate_muscle(secondary_en))
        if tertiary_en:
            muscoli_secondari.append(translate_muscle(tertiary_en))
        
        gruppo_secondario = ', '.join(filter(None, muscoli_secondari)) or None
        
        # --- Attrezzatura ---
        equipment_en = get_cell_value(row, COL['equipment'])
        attrezzatura = EQUIPMENT_MAP.get(equipment_en, equipment_en) if equipment_en else None
        if attrezzatura:
            attrezzature_set.add(attrezzatura)
        
        # --- Video (hyperlink) ---
        # row index in openpyxl è 1-indexed, quindi aggiungiamo 1
        excel_row = i + 1  # i è 0-indexed dall'array, +1 per openpyxl
        video_demo = get_hyperlink_url(ws, excel_row, COL['video_demo'])
        video_expl = get_hyperlink_url(ws, excel_row, COL['video_expl'])
        link_video = video_demo or video_expl or None
        if link_video:
            video_count += 1
        
        # --- Campi aggiuntivi ---
        difficulty_en = get_cell_value(row, COL['difficulty'])
        difficulty = DIFFICULTY_MAP.get(difficulty_en, difficulty_en)
        
        body_region_en = get_cell_value(row, COL['body_region'])
        body_region = BODY_REGION_MAP.get(body_region_en, body_region_en)
        
        mechanics_en = get_cell_value(row, COL['mechanics'])
        mechanics = MECHANICS_MAP.get(mechanics_en, mechanics_en)
        
        posture = get_cell_value(row, COL['posture'])
        
        # Movement patterns (concatena fino a 3)
        patterns = []
        for key in ['movement_pattern_1', 'movement_pattern_2', 'movement_pattern_3']:
            p = get_cell_value(row, COL[key])
            if p:
                patterns.append(p)
        movement_pattern = ', '.join(patterns) if patterns else None
        
        laterality = get_cell_value(row, COL['laterality'])
        force_type = get_cell_value(row, COL['force_type'])
        classification = get_cell_value(row, COL['classification'])
        
        # --- Costruisci oggetto esercizio ---
        esercizio = {
            'nome': nome,
            'gruppoMuscoloPrimario': gruppo_primario,
            'gruppoMuscoloSecondario': gruppo_secondario,
            'attrezzatura': attrezzatura,
            'linkVideo': link_video,
            'difficulty': difficulty,
            'bodyRegion': body_region,
            'mechanics': mechanics,
            'posture': posture,
            'movementPattern': movement_pattern,
            'laterality': laterality,
            'forceType': force_type,
            'classification': classification,
        }
        
        esercizi.append(esercizio)
    
    print(f"\n✅ Esercizi estratti: {len(esercizi)}")
    print(f"⏭️  Righe saltate (vuote): {skipped}")
    print(f"🎬 Con link video: {video_count}")
    print(f"🏋️  Attrezzature uniche: {len(attrezzature_set)}")
    
    # --- Salva esercizi JSON ---
    esercizi_path = os.path.join(OUTPUT_DIR, 'esercizi.json')
    with open(esercizi_path, 'w', encoding='utf-8') as f:
        json.dump(esercizi, f, ensure_ascii=False, indent=2)
    print(f"\n💾 Salvato: {esercizi_path}")
    
    # --- Genera attrezzature aggiuntive ---
    # Categorizzazione automatica
    CATEGORIA_MAP = {
        'Bilanciere Olimpico': 'PESI_LIBERI',
        'Manubri (Set)': 'PESI_LIBERI',
        'Kettlebell': 'PESI_LIBERI',
        'Bilanciere EZ': 'PESI_LIBERI',
        'Trap Bar (Hex Bar)': 'PESI_LIBERI',
        'Disco (Peso)': 'PESI_LIBERI',
        'Cavo Singolo Regolabile': 'CAVI',
        'Sbarra per Trazioni': 'FUNZIONALE',
        'Parallele (Dip Station)': 'FUNZIONALE',
        'Ab Wheel': 'FUNZIONALE',
        'Palla di Stabilità': 'FUNZIONALE',
        'Anelli Ginnici': 'FUNZIONALE',
        'Elastico di Resistenza': 'FUNZIONALE',
        'Superband': 'FUNZIONALE',
        'Miniband': 'FUNZIONALE',
        'Palla Medica': 'FUNZIONALE',
        'Slam Ball': 'FUNZIONALE',
        'Wall Ball': 'FUNZIONALE',
        'Suspension Trainer (TRX)': 'FUNZIONALE',
        'Landmine': 'PESI_LIBERI',
        'Battle Ropes': 'FUNZIONALE',
        'Sandbag': 'FUNZIONALE',
        'Sandbag Pesante': 'FUNZIONALE',
        'Sliders': 'FUNZIONALE',
        'Slitta (Sled)': 'FUNZIONALE',
        'Pneumatico (Tire)': 'FUNZIONALE',
        'Clubbell': 'FUNZIONALE',
        'Macebell': 'FUNZIONALE',
        'Indian Club': 'FUNZIONALE',
        'Bulgarian Bag': 'FUNZIONALE',
        'Corda da Arrampicata': 'FUNZIONALE',
    }
    
    nuove_attrezzature = []
    for attr_nome in sorted(attrezzature_set):
        categoria = CATEGORIA_MAP.get(attr_nome, 'FUNZIONALE')
        nuove_attrezzature.append({
            'nome': attr_nome,
            'categoria': categoria,
            'muscoliBersaglio': 'Tutto il corpo'
        })
    
    attr_path = os.path.join(OUTPUT_DIR, 'attrezzature_importate.json')
    with open(attr_path, 'w', encoding='utf-8') as f:
        json.dump(nuove_attrezzature, f, ensure_ascii=False, indent=2)
    print(f"💾 Salvato: {attr_path}")
    
    # --- Statistiche finali ---
    print("\n📊 === STATISTICHE ===")
    
    # Gruppi muscolari
    from collections import Counter
    gruppi = Counter(e['gruppoMuscoloPrimario'] for e in esercizi)
    print("\nGruppi muscolari:")
    for g, c in gruppi.most_common():
        print(f"  {g}: {c}")
    
    # Difficoltà
    diff = Counter(e['difficulty'] for e in esercizi if e['difficulty'])
    print("\nDifficoltà:")
    for d, c in diff.most_common():
        print(f"  {d}: {c}")
    
    # Body Region
    regions = Counter(e['bodyRegion'] for e in esercizi if e['bodyRegion'])
    print("\nBody Region:")
    for r, c in regions.most_common():
        print(f"  {r}: {c}")
    
    print(f"\n🎉 Conversione completata!")


if __name__ == '__main__':
    main()
