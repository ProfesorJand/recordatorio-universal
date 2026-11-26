import { useRef, useState, type MouseEvent } from 'react';
import { useCanvas, roundRectRight } from './useCanvas';

/**
 * Barras horizontales apiladas dibujadas con canvas.
 * Una fila por persona; cada segmento es un estado (a tiempo, tarde, pendiente…).
 *
 * Reglas de diseño usadas:
 *  - Marcas finas (barra de 18 px), 2 px de separación entre segmentos.
 *  - Solo el extremo final de la barra va redondeado.
 *  - El total va en texto gris oscuro al final (nunca del color de la serie).
 *  - Tooltip al pasar el mouse (los colores nunca van solos: siempre con su nombre).
 */
export interface Series { key: string; label: string; color: string }
export interface BarRow { label: string; values: Record<string, number> }

const ROW_H = 34;
const BAR_H = 18;
const LEFT = 130; // espacio para los nombres
const RIGHT = 40; // espacio para el total
const TOP = 6;
const GAP = 2;

interface Hit { x: number; y: number; w: number; h: number; row: number; key: string }

export default function StackedBarChart({ rows, series }: { rows: BarRow[]; series: Series[] }) {
  const height = TOP * 2 + rows.length * ROW_H;
  const hits = useRef<Hit[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; row: number; key: string } | null>(null);

  const max = Math.max(1, ...rows.map((r) => series.reduce((s, se) => s + (r.values[se.key] || 0), 0)));

  const { wrapRef, canvasRef } = useCanvas(height, (ctx, w) => {
    hits.current = [];
    const plotW = w - LEFT - RIGHT;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    rows.forEach((r, i) => {
      const yMid = TOP + i * ROW_H + ROW_H / 2;
      const y = yMid - BAR_H / 2;

      // Nombre de la persona (recortado si es muy largo)
      ctx.fillStyle = '#5c5f66';
      ctx.textAlign = 'right';
      let name = r.label;
      while (ctx.measureText(name).width > LEFT - 12 && name.length > 3) name = name.slice(0, -2) + '…';
      ctx.fillText(name, LEFT - 10, yMid);

      // Carril de fondo muy suave
      ctx.fillStyle = '#f1f2f4';
      ctx.fillRect(LEFT, y, plotW, BAR_H);

      // Segmentos
      const total = series.reduce((s, se) => s + (r.values[se.key] || 0), 0);
      const visible = series.filter((se) => (r.values[se.key] || 0) > 0);
      let x = LEFT;
      visible.forEach((se, j) => {
        const v = r.values[se.key];
        const segW = (v / max) * plotW;
        const drawW = Math.max(1, segW - (j < visible.length - 1 ? GAP : 0)); // 2px de aire entre segmentos
        ctx.fillStyle = se.color;
        if (j === visible.length - 1) {
          roundRectRight(ctx, x, y, drawW, BAR_H, 4);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, drawW, BAR_H);
        }
        hits.current.push({ x, y: y - 6, w: segW, h: BAR_H + 12, row: i, key: se.key }); // zona de hover más grande que la barra
        x += segW;
      });

      // Total al final
      ctx.fillStyle = '#191919';
      ctx.textAlign = 'left';
      ctx.fillText(Number.isInteger(total) ? String(total) : total.toFixed(1), x + 6, yMid);
    });
  }, [rows, series, max]);

  function onMove(e: MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hits.current.find((h) => mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h);
    setTip(hit ? { x: mx, y: my, row: hit.row, key: hit.key } : null);
  }

  const tipRow = tip ? rows[tip.row] : null;
  const tipSeries = tip ? series.find((s) => s.key === tip.key) : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setTip(null)} role="img"
        aria-label="Tareas por persona y estado. Ver la tabla para los números." />
      {tip && tipRow && tipSeries && (
        <div style={{
          position: 'absolute', left: Math.min(tip.x + 12, (wrapRef.current?.clientWidth || 300) - 190), top: tip.y + 12,
          background: '#191919', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5,
        }}>
          <div style={{ fontWeight: 600 }}>{tipRow.label}</div>
          <div><span className="dot" style={{ background: tipSeries.color, marginRight: 6 }} />{tipSeries.label}: <strong>{tipRow.values[tipSeries.key]}</strong></div>
        </div>
      )}
    </div>
  );
}
