import { useState, type MouseEvent } from 'react';
import { useCanvas, niceMax } from './useCanvas';

/**
 * Gráfico de línea con canvas (una sola serie).
 * - Línea de 2 px, puntos de 8 px, cuadrícula muy suave.
 * - Al pasar el mouse: línea vertical (crosshair) + tooltip con el valor.
 */
export interface Point { label: string; value: number; hint?: string }

const PAD = { top: 14, right: 16, bottom: 28, left: 34 };

export default function LineChart({ points, color = '#257de0', height = 220, unit = '' }: { points: Point[]; color?: string; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...points.map((p) => p.value)));

  // Posición x de cada punto (se calcula igual al dibujar y al hacer hover)
  const xAt = (i: number, w: number) => {
    const plotW = w - PAD.left - PAD.right;
    return PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  };
  const yAt = (v: number) => PAD.top + (1 - v / max) * (height - PAD.top - PAD.bottom);

  const { wrapRef, canvasRef, width } = useCanvas(height, (ctx, w, h) => {
    ctx.font = '11px system-ui, sans-serif';

    // Cuadrícula horizontal + etiquetas del eje Y
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const v = (max / ticks) * t;
      const y = yAt(v);
      ctx.strokeStyle = t === 0 ? '#c9ccd2' : '#eceef1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, Math.round(y) + 0.5);
      ctx.lineTo(w - PAD.right, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = '#8a8d94';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(Number.isInteger(v) ? String(v) : v.toFixed(1), PAD.left - 6, y);
    }

    // Etiquetas del eje X (solo algunas para que no se encimen)
    const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor((w - PAD.left) / 70))));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    points.forEach((p, i) => {
      if (i % every === 0 || i === points.length - 1) ctx.fillText(p.label, xAt(i, w), h - PAD.bottom + 8);
    });

    // Crosshair
    if (hover !== null) {
      ctx.strokeStyle = '#c9ccd2';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xAt(hover, w), PAD.top);
      ctx.lineTo(xAt(hover, w), h - PAD.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Línea
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(xAt(i, w), yAt(p.value)) : ctx.lineTo(xAt(i, w), yAt(p.value))));
    ctx.stroke();

    // Puntos (con anillo blanco de 2px para separarlos de la línea)
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(xAt(i, w), yAt(p.value), hover === i ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
  }, [points, hover, max, color]);

  function onMove(e: MouseEvent<HTMLCanvasElement>) {
    if (!points.length) return;
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
    // punto más cercano en X
    let best = 0;
    let bestD = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(xAt(i, width) - mx);
      if (d < bestD) { bestD = d; best = i; }
    });
    setHover(best);
  }

  const hp = hover !== null ? points[hover] : null;
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Tareas completadas por semana" />
      {hp && hover !== null && (
        <div style={{
          position: 'absolute', left: Math.min(xAt(hover, width) + 10, width - 170), top: Math.max(0, yAt(hp.value) - 44),
          background: '#191919', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 600 }}>{hp.hint || hp.label}</div>
          <div>{hp.value} {unit}</div>
        </div>
      )}
    </div>
  );
}
