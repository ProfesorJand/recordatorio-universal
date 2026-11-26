import { useEffect, useRef, useState } from 'react';

/**
 * Campos de fecha y hora SIEMPRE en formato dd/mm/aaaa y 24 h.
 * (El <input type="datetime-local"> del navegador usa el idioma de Windows/Chrome
 * y por eso a veces sale mm/dd/aaaa y AM/PM.)
 *
 * El valor que entra y sale es el mismo de antes: "2026-12-17T09:30" (o "" si está vacío),
 * así el resto de la app no cambia.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-12-17" -> "17/12/2026" */
const toDmy = (ymd: string) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '');

/** "17/12/2026" -> "2026-12-17" (o null si no es una fecha válida) */
function fromDmy(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = +m[1];
  const mo = +m[2];
  const y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** Mientras escribe: agrega las barras solas (17122026 -> 17/12/2026) */
function mask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Hora en 24 h con dos listas: horas 00-23 y minutos de 5 en 5 */
export function TimeSelect({ value, onChange, disabled }: { value: string; onChange: (hhmm: string) => void; disabled?: boolean }) {
  const [h, m] = (value || '09:00').split(':');
  const minutes = Array.from({ length: 12 }, (_, i) => pad(i * 5));
  if (m && !minutes.includes(m)) minutes.push(m), minutes.sort();
  return (
    <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
      <select value={h} disabled={disabled} onChange={(e) => onChange(`${e.target.value}:${m || '00'}`)} style={{ width: 'auto' }} aria-label="Hora">
        {Array.from({ length: 24 }, (_, i) => pad(i)).map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <strong>:</strong>
      <select value={m || '00'} disabled={disabled} onChange={(e) => onChange(`${h}:${e.target.value}`)} style={{ width: 'auto' }} aria-label="Minutos">
        {minutes.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </span>
  );
}

export default function DateTimeInput({ value, onChange, defaultTime = '09:00' }: {
  value: string;
  onChange: (v: string) => void;
  defaultTime?: string;
}) {
  const ymd = value ? value.slice(0, 10) : '';
  const time = value ? value.slice(11, 16) : defaultTime;
  const [text, setText] = useState(toDmy(ymd));
  const [invalid, setInvalid] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Si el valor cambia desde afuera (botones rápidos, etc.), actualizar el texto
  useEffect(() => {
    if (fromDmy(text) !== ymd) setText(toDmy(ymd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ymd]);

  function onText(raw: string) {
    const t = mask(raw);
    setText(t);
    if (t === '') {
      setInvalid(false);
      onChange('');
      return;
    }
    const parsed = fromDmy(t);
    setInvalid(t.length === 10 && !parsed);
    if (parsed) onChange(`${parsed}T${time}`);
  }

  function openCalendar() {
    const el = pickerRef.current;
    if (!el) return;
    try {
      (el as any).showPicker(); // calendario del navegador
    } catch {
      el.focus();
    }
  }

  return (
    <span className="row" style={{ gap: 6 }}>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <input type="text" inputMode="numeric" placeholder="dd/mm/aaaa" value={text} onChange={(e) => onText(e.target.value)}
          style={{ width: 128, borderColor: invalid ? 'var(--danger)' : undefined }} aria-label="Fecha (dd/mm/aaaa)" />
        <button type="button" className="btn sm ghost" onClick={openCalendar} aria-label="Abrir calendario" style={{ position: 'absolute', right: 2 }}>📅</button>
        {/* calendario nativo invisible, solo para elegir con el mouse */}
        <input ref={pickerRef} type="date" tabIndex={-1} aria-hidden="true" value={ymd}
          onChange={(e) => { setText(toDmy(e.target.value)); onChange(e.target.value ? `${e.target.value}T${time}` : ''); }}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, left: 0, bottom: 0 }} />
      </span>
      <TimeSelect value={time} disabled={!ymd} onChange={(t) => ymd && onChange(`${ymd}T${t}`)} />
      {invalid && <span className="tiny" style={{ color: 'var(--danger)' }}>Fecha inválida</span>}
    </span>
  );
}
