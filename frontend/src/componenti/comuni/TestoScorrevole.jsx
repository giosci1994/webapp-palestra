import { useState, useRef, useEffect } from 'react';

/**
 * Componente TestoScorrevole
 * Se il testo è più lungo del contenitore, su hover (desktop) o tocco (mobile)
 * scorre orizzontalmente in modo da essere letto per intero.
 */
export default function TestoScorrevole({ testo, className = '', coloreSfondo = 'var(--bg-terziario)' }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [scrollAmount, setScrollAmount] = useState(0);
  const [hover, setHover] = useState(false);

  const calcolaScorrimento = () => {
    if (containerRef.current && textRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const textWidth = textRef.current.scrollWidth;
      if (textWidth > containerWidth) {
        setScrollAmount(textWidth - containerWidth);
      } else {
        setScrollAmount(0);
      }
    }
  };

  useEffect(() => {
    // Piccolo delay per consentire il rendering del layout
    const timer = setTimeout(calcolaScorrimento, 100);
    return () => clearTimeout(timer);
  }, [testo]);

  useEffect(() => {
    window.addEventListener('resize', calcolaScorrimento);
    return () => window.removeEventListener('resize', calcolaScorrimento);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onTouchStart={() => setHover(true)}
      onTouchEnd={() => setHover(false)}
      className="overflow-hidden w-full select-none relative py-0.5"
    >
      <div
        ref={textRef}
        style={{
          transform: hover && scrollAmount > 0 ? `translateX(-${scrollAmount}px)` : 'translateX(0px)',
          transition: `transform ${scrollAmount > 0 ? Math.max(1.5, scrollAmount / 60) : 2}s ease-in-out`
        }}
        className={`whitespace-nowrap w-max block ${className}`}
      >
        {testo}
      </div>
      
      {/* Sfumatura premium a destra che indica la presenza di testo nascosto */}
      {scrollAmount > 0 && !hover && (
        <div
          className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none transition-opacity duration-300"
          style={{
            background: `linear-gradient(to right, transparent, ${coloreSfondo})`
          }}
        />
      )}
    </div>
  );
}
