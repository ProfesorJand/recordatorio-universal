import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';

/**
 * Tutorial guiado hecho a mano (sin librerías).
 *
 * Cómo funciona:
 *  1. Cada paso apunta a un elemento con un atributo data-tour="nombre".
 *  2. Medimos ese elemento con getBoundingClientRect().
 *  3. Dibujamos un recuadro encima con una sombra gigante (box-shadow de 9999px)
 *     que oscurece todo lo demás: así parece un "foco".
 *  4. Mostramos una tarjeta con el texto al lado del recuadro.
 * Si el elemento no existe en la pantalla, la tarjeta sale centrada.
 */
export interface TourStep {
  target?: string; // valor de data-tour
  title: string;
  text: string;
  /** Ejemplo que se muestra dentro de la tarjeta si el elemento no está en pantalla */
  demo?: 'checkin';
}

/** Botones de ejemplo (no hacen nada) para explicar el "¿cómo va?" aunque no haya tareas */
function DemoCheckin() {
  return (
    <div className="card" style={{ padding: '0.6rem', marginBottom: '0.8rem', background: 'var(--surface-2)' }} aria-hidden="true">
      <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Ejemplo: Entregar informe semanal</div>
      <div className="row" style={{ gap: '0.35rem', pointerEvents: 'none' }}>
        <span className="btn sm ok">✅ Ya lo hice</span>
        <span className="btn sm">🔄 Sigo en eso</span>
        <span className="btn sm">⏰ Aplazar ▾</span>
      </div>
    </div>
  );
}

export default function Tour({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];

  const measure = useCallback(() => {
    if (!step?.target) return setRect(null);
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  // Al cambiar de paso: llevar el elemento a la vista y medirlo
  useLayoutEffect(() => {
    if (!step?.target) return measure();
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(measure, 350); // esperar a que termine el scroll
    measure();
    return () => clearTimeout(t);
  }, [i, step, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onFinish();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [measure, onFinish]);

  if (!step) return null;

  const pad = 6;
  const cardW = Math.min(340, window.innerWidth * 0.92);
  let cardStyle: CSSProperties;
  if (rect) {
    const below = rect.bottom + 180 < window.innerHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - cardW - 8));
    cardStyle = below ? { top: rect.bottom + pad + 10, left } : { top: Math.max(8, rect.top - pad - 190), left };
  } else {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const last = i === steps.length - 1;
  return (
    <>
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-spot" style={{ inset: 0, boxShadow: 'none', background: 'rgba(10,15,25,.6)' }} />
      )}
      <div className="tour-card" style={cardStyle} role="dialog" aria-label={step.title}>
        <div className="tiny muted">Paso {i + 1} de {steps.length}</div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        {!rect && step.demo === 'checkin' && <DemoCheckin />}
        <div className="row between">
          <button className="btn sm ghost" onClick={onFinish}>Saltar tutorial</button>
          <div className="row">
            {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>← Atrás</button>}
            <button className="btn sm primary" onClick={() => (last ? onFinish() : setI(i + 1))}>{last ? '¡Entendido!' : 'Siguiente →'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
