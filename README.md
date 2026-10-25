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

## Nota sobre el visor

Los PDF se muestran con la visualización nativa del navegador a través de un
`<iframe>`; los registros fotográficos se muestran como imagen. Cada ficha incluye
además enlaces de descarga y a la ficha original en el sitio de la Biblioteca.
