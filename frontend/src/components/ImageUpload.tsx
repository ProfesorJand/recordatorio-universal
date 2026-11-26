import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react';
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

/**
 * Pegar (Ctrl+V) o arrastrar una imagen dentro de un cuadro de texto.
 * Uso: const paste = useImagePaste((url, name) => ...);  <textarea {...paste.handlers} />
 */
export function useImagePaste(onUploaded: (url: string, name: string) => void) {
  const [busy, setBusy] = useState(false);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        // las capturas pegadas llegan como "image.png": les damos un nombre con fecha
        const name = f.name && f.name !== 'image.png' ? f.name : `captura-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
        const url = await uploadImage(new File([f], name, { type: f.type }));
        onUploaded(url, name);
      }
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  const images = (list: FileList | DataTransferItemList | null | undefined): File[] => {
    const out: File[] = [];
    if (!list) return out;
    for (let i = 0; i < list.length; i++) {
      const it = list[i] as File | DataTransferItem;
      const file = 'getAsFile' in it ? (it.kind === 'file' ? it.getAsFile() : null) : it;
      if (file && file.type.startsWith('image/')) out.push(file);
    }
    return out;
  };

  return {
    busy,
    handlers: {
      onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const files = images(e.clipboardData?.items);
        if (files.length) {
          e.preventDefault(); // si hay imagen, no pegar texto raro
          upload(files);
        }
      },
      onDrop: (e: DragEvent<HTMLTextAreaElement>) => {
        const files = images(e.dataTransfer?.files);
        if (files.length) {
          e.preventDefault();
          upload(files);
        }
      },
      onDragOver: (e: DragEvent<HTMLTextAreaElement>) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
      },
    },
  };
}
