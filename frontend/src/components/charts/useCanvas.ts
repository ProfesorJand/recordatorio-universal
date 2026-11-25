import { useEffect, useRef, useState } from 'react';

/**
 * Hook para dibujar en <canvas> de forma nítida:
 *  - Mide el ancho del contenedor (ResizeObserver) para que el gráfico sea responsive.
 *  - Multiplica por devicePixelRatio: en pantallas "retina" un píxel CSS son 2 o 3
 *    píxeles reales. Si no hacemos esto, el gráfico se ve borroso.
 *  - Llama a draw(ctx, ancho, alto) cada vez que cambia el tamaño o los datos.
 */
export function useCanvas(height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; // tamaño real en píxeles
    canvas.height = height * dpr;
    canvas.style.width = width + 'px'; // tamaño visible en CSS
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // a partir de aquí dibujamos en píxeles CSS
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, ...deps]);

  return { wrapRef, canvasRef, width };
}

/** Rectángulo con esquinas redondeadas solo a la derecha (el extremo del dato). */
export function roundRectRight(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w, h / 2);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

/** Devuelve un número "redondo" para el máximo del eje (ej: 7 -> 8, 23 -> 25). */
export function niceMax(v: number): number {
  if (v <= 5) return Math.max(1, Math.ceil(v));
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}
