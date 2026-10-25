# Catálogo de Colecciones — Biblioteca Central UNMDP

Sitio estático construido con [Astro](https://astro.build) que publica las
**colecciones digitales** de la Biblioteca Central de la Universidad Nacional
de Mar del Plata: Ex Libris, Archivo de recortes de prensa, Fotografías, Libros,
Publicidades Gráficas, Postales, Revistas, Mapas y Chalets de Mar del Plata.

Los datos provienen de la API REST de **Tainacan**:

```
https://biblio1.mdp.edu.ar/colecciones/wp-json/tainacan/v2/collections
```

## Estructura

- `scripts/fetch-catalogo.mjs` — recorre todas las colecciones, resuelve y descarga
  documentos y portadas a `public/pdfs/`, `public/media/` y `public/covers/`, y genera
  `src/data/colecciones.json`.
- `src/pages/index.astro` — portada con la grilla de colecciones.
- `src/pages/colecciones/[slug].astro` — registros de una colección con búsqueda.
- `src/pages/colecciones/[slug]/[item].astro` — ficha de detalle con visor (PDF o imagen).
- `src/components/CollectionCard.astro` y `src/components/ItemCard.astro`.

## Comandos

```bash
npm install      # dependencias
npm run fetch    # (re)descarga datos, documentos y portadas desde Tainacan
npm run dev      # servidor de desarrollo
npm run build    # compila el sitio estático en dist/
npm run preview  # previsualiza el build
```

> Las descargas son incrementales: los archivos existentes no se vuelven a bajar.
> Para actualizar por completo, borrá `public/pdfs`, `public/media` y `public/covers`.

## Publicación en GitHub Pages

El workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) compila y publica
el sitio en cada push a `main`:

- URL: https://juanmiguel-dev.github.io/mardelback/
- CI ejecuta `npm run fetch` (descarga los ~886 MB de PDFs e imágenes) y luego
  `npm run build` con `GITHUB_PAGES=true`, que fija el `base` del sitio en `/mardelback/`.
- Para habilitar Pages: Settings → Pages → Build and deployment → Source: **GitHub Actions**
  (el workflow intenta habilitarlo automáticamente con `configure-pages`).

## Publicación en Cloudflare Pages

Cloudflare Pages limita los archivos a **25 MB**, y varios PDFs pesan más (hasta 92 MB).
Por eso el build para Cloudflare **enlaza los PDF** al original en Tainacan y copia
localmente sólo imágenes y portadas:

```bash
npm run build:cf    # fetch con --hotlink-pdfs + astro build (base "/")
npx wrangler pages deploy dist --project-name mardelback
```

Sitio: https://mardelback.pages.dev/

## Nota sobre el visor

Los PDF se muestran con la visualización nativa del navegador a través de un
`<iframe>`; los registros fotográficos se muestran como imagen. Cada ficha incluye
además enlaces de descarga y a la ficha original en el sitio de la Biblioteca.
