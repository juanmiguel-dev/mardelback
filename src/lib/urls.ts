/** Base del sitio (termina con "/"): "/" en local, "/mardelback/" en GitHub Pages. */
export const BASE = import.meta.env.BASE_URL;

/**
 * Prefija una ruta interna con el base del sitio.
 * Las URLs absolutas http(s) se devuelven sin cambios.
 */
export function withBase(path: string | undefined | null): string {
  if (!path) return BASE;
  if (/^https?:\/\//i.test(path)) return path;
  return BASE + path.replace(/^\//, '');
}
