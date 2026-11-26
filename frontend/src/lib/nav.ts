import { navigate } from 'astro:transitions/client';
import { url } from './config';

/**
 * Navegar sin recargar la página (gracias a <ClientRouter /> de Astro).
 * Importante para que la ventana flotante (Picture-in-Picture) no se cierre
 * al cambiar de página.
 */
export function go(path: string) {
  navigate(url(path));
}
