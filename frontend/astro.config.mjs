// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// GitHub Pages: https://profesorjand.github.io/recordatorio-universal/
export default defineConfig({
  site: 'https://profesorjand.github.io',
  base: '/recordatorio-universal',
  trailingSlash: 'ignore',
  integrations: [react()],
});
