import { useRef, useState, type ChangeEvent } from 'react';
import { uploadImage } from '../lib/api';
import { toastError } from '../stores/app';

/** Botón que sube una imagen al servidor y devuelve su URL. */
export default function ImageUpload({ onUploaded, label = '🖼 Subir imagen' }: { onUploaded: (url: string, name: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage(file);
      onUploaded(url, file.name);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }

  return (
    <>
      <input ref={ref} type="file" accept="image/*" hidden onChange={onChange} />
      <button type="button" className="btn sm" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? 'Subiendo…' : label}
      </button>
    </>
  );
}
