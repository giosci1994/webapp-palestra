// ============================================
// GymMaster — Ritaglio + compressione foto profilo
// Modale: ritaglia (quadrato/touch) e riduce automaticamente la dimensione.
// ============================================

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';

function caricaImmagine(src) {
  return new Promise((risolvi, rifiuta) => {
    const img = new Image();
    img.onload = () => risolvi(img);
    img.onerror = rifiuta;
    img.src = src;
  });
}

// Ritaglia la regione scelta e la ridisegna a `dimensione`px, esportando JPEG compresso (base64).
async function ritagliaEComprimi(src, pixelCrop, dimensione = 400, qualita = 0.85) {
  const image = await caricaImmagine(src);
  const canvas = document.createElement('canvas');
  canvas.width = dimensione;
  canvas.height = dimensione;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, dimensione, dimensione
  );
  return canvas.toDataURL('image/jpeg', qualita);
}

export default function RitaglioFoto({ immagine, onAnnulla, onConferma }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState(null);
  const [elaborando, setElaborando] = useState(false);

  const onCropComplete = useCallback((_, areaPixels) => setPixels(areaPixels), []);

  const conferma = async () => {
    if (!pixels) return;
    setElaborando(true);
    try {
      const base64 = await ritagliaEComprimi(immagine, pixels);
      onConferma(base64);
    } catch {
      alert('Errore durante il ritaglio della foto');
    } finally {
      setElaborando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-4"
         style={{ paddingTop: 'calc(16px + var(--safe-top))', paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
      <div className="glass-card w-full max-w-sm p-card-inner flex flex-col gap-4">
        <h3 className="font-bold text-lg text-center">Ritaglia la foto</h3>
        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
          <Cropper
            image={immagine}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--testo-terziario)] shrink-0">Zoom</span>
          <input type="range" min={1} max={3} step={0.01} value={zoom}
                 onChange={e => setZoom(Number(e.target.value))}
                 className="flex-1 accent-[var(--accent)]" />
        </div>
        <p className="text-[10px] text-[var(--testo-terziario)] text-center">Trascina per spostare, usa lo zoom per inquadrare. La foto verrà ridotta automaticamente.</p>
        <div className="flex gap-3">
          <button onClick={onAnnulla} className="btn-secondario flex-1">Annulla</button>
          <button onClick={conferma} disabled={elaborando} className="btn-primario flex-1 disabled:opacity-50">
            {elaborando ? 'Elaboro…' : 'Conferma'}
          </button>
        </div>
      </div>
    </div>
  );
}
