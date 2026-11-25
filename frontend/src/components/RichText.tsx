import { Fragment, type ReactNode } from 'react';

/**
 * Muestra texto con enlaces e imágenes SIN usar innerHTML (así nadie puede
 * inyectar código). Formatos soportados:
 *   ![descripción](https://...imagen.png)   -> imagen
 *   [texto](https://...)                    -> enlace
 *   https://...                             -> enlace (o imagen si termina en .png/.jpg/...)
 *   **negrita**
 */
const TOKEN = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)|\*\*([^*]+)\*\*/g;
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;

function renderLine(line: string, key: number): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let i = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2]) {
      out.push(<a key={k} href={m[2]} target="_blank" rel="noopener noreferrer"><img src={m[2]} alt={m[1] || 'imagen'} loading="lazy" /></a>);
    } else if (m[4]) {
      out.push(<a key={k} href={m[4]} target="_blank" rel="noopener noreferrer">{m[3]}</a>);
    } else if (m[5]) {
      const href = m[5].replace(/[.,;:!?)]+$/, '');
      const trailing = m[5].slice(href.length);
      out.push(
        IMG_EXT.test(href)
          ? <a key={k} href={href} target="_blank" rel="noopener noreferrer"><img src={href} alt="imagen" loading="lazy" /></a>
          : <a key={k} href={href} target="_blank" rel="noopener noreferrer">{href}</a>,
      );
      if (trailing) out.push(trailing);
    } else if (m[6]) {
      out.push(<strong key={k}>{m[6]}</strong>);
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export default function RichText({ text }: { text: string | null | undefined }) {
  if (!text) return <p className="muted small">Sin descripción.</p>;
  const lines = text.split(/\r?\n/);
  return (
    <div className="rich">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {renderLine(line, i)}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </div>
  );
}
