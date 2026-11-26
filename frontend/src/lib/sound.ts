/**
 * Sonidos generados con Web Audio API (no hace falta ningún archivo .mp3).
 * Ojo: los navegadores no dejan sonar nada hasta que la persona hace al
 * menos un clic en la página. Por eso "desbloqueamos" el audio en el primer clic.
 */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Llamar en el primer clic/toque para que el navegador permita sonidos. */
export function unlockAudio() {
  getCtx();
}

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem('ru_sound') !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem('ru_sound', on ? 'on' : 'off');
  } catch {
    /* ignorar */
  }
}

/** Un tono: frecuencia (Hz), inicio y duración (segundos) */
function tone(c: AudioContext, freq: number, start: number, dur: number, vol = 0.22, type: OscillatorType = 'sine') {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // subida y bajada suave para que no haga "click"
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** Aviso normal: "din-don" corto */
export function playNotify(force = false) {
  if (!force && !soundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime + 0.02;
  tone(c, 880, t, 0.18);
  tone(c, 1318, t + 0.16, 0.3);
}

/** Alarma urgente: 3 pulsos dobles, más fuerte e insistente */
export function playUrgent(force = false) {
  if (!force && !soundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime + 0.02;
  for (let i = 0; i < 3; i++) {
    const s = t + i * 0.45;
    tone(c, 988, s, 0.14, 0.3, 'square');
    tone(c, 740, s + 0.17, 0.18, 0.3, 'square');
  }
}
