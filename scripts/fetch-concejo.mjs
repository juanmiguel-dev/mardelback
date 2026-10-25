import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Fuente "HCD General Pueyrredon": galería "Ciudad de Mar del Plata (Antiguas)".
const BASE_ORIGIN = 'https://www.concejomdp.gov.ar';
const URL_GALLERY = `${BASE_ORIGIN}/galeria/mdp/mdp_antiguas/`;
const DEST = fileURLToPath(new URL('../src/data/concejo.json', import.meta.url));

function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanTitle(rawFilename) {
  return rawFilename
    .replace(/\.(jpe?g|png|webp|gif)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const res = await fetch(URL_GALLERY, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir Concejo MDP`);
  const html = await res.text();

  const galeriaMatch = html.match(/<div id="galeria"[^>]*>([\s\S]*?)<\/div>/i);
  const scope = galeriaMatch ? galeriaMatch[1] : html;

  const linkRe = /<a\s+href="(\/galeria\/mdp\/mdp_antiguas\/[^"]+)"/gi;
  const seen = new Set();
  const usedSlugs = new Set();
  const items = [];

  let m;
  while ((m = linkRe.exec(scope)) !== null) {
    const rawHref = m[1];
    if (seen.has(rawHref)) continue;
    seen.add(rawHref);

    const parts = rawHref.split('/');
    const rawFilename = decodeURIComponent(parts[parts.length - 1]);
    const title = cleanTitle(rawFilename) || `Foto ${items.length + 1}`;

    const encodedPath = parts
      .map((seg, idx) => (idx === parts.length - 1 ? encodeURIComponent(rawFilename) : seg))
      .join('/');
    const imageUrl = `${BASE_ORIGIN}${encodedPath}`;

    let slug = slugify(title) || `foto-${items.length + 1}`;
    if (usedSlugs.has(slug)) {
      let n = 2;
      while (usedSlugs.has(`${slug}-${n}`)) n += 1;
      slug = `${slug}-${n}`;
    }
    usedSlugs.add(slug);

    // Extraer año aproximado si figura en el nombre del archivo
    const yearMatch = title.match(/\b((?:circa\s+)?18\d{2}|(?:circa\s+)?19\d{2}|siglo\s+xix|decada\s+\d+)\b/i);
    const metadata = [];
    if (yearMatch) {
      metadata.push({
        name: 'Fecha / Época',
        value: yearMatch[0],
      });
    }

    items.push({
      id: items.length + 1,
      title,
      description: '',
      slug,
      urlOriginal: URL_GALLERY,
      documentType: 'url',
      documentMimetype: 'image/jpeg',
      document: '',
      documentUrl: imageUrl,
      thumbnail: imageUrl,
      thumbnailUrl: imageUrl,
      metadata,
    });
  }

  const fuente = {
    id: 'concejo-mdp',
    nombre: 'Honorable Concejo Deliberante · General Pueyrredon',
    descripcion:
      'Galería fotográfica histórica del Honorable Concejo Deliberante del Partido de General Pueyrredon.',
    url: URL_GALLERY,
    colecciones: [
      {
        id: 'mdp-antiguas',
        name: 'Ciudad de Mar del Plata (Antiguas)',
        slug: 'ciudad-de-mar-del-plata-antiguas',
        description:
          'Archivo fotográfico histórico de la ciudad de Mar del Plata publicado por el Honorable Concejo Deliberante de General Pueyrredon: postales, planos, edificios emblemáticos, ramblas, playas y puerto entre fines del siglo XIX y el siglo XX.',
        itemCount: items.length,
        urlOriginal: URL_GALLERY,
        thumbnail: items[0]?.thumbnailUrl || '',
        items,
      },
    ],
  };

  await writeFile(DEST, `${JSON.stringify(fuente, null, 2)}\n`);
  console.log(`concejo.json generado: ${items.length} fotos`);
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
