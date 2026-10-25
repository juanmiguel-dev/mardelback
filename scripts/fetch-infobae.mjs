import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Fuente "Infobae": galería de fotos "La historia de Mar del Plata en 50 fotos".
// No re-descargamos las imágenes: se enlazan al CDN de Infobae (width=1024).
const URL_ARTICLE =
  'https://www.infobae.com/fotos/2024/02/10/la-historia-de-mar-del-plata-en-50-fotos-imperdibles-de-un-simple-saladero-al-balneario-emblematico-de-la-argentina/';
const DEST = fileURLToPath(new URL('../src/data/infobae.json', import.meta.url));

const ENTITIES = {
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&#8217;': '’',
  '&#8211;': '–',
  '&#8212;': '—',
  '&#8220;': '“',
  '&#8221;': '”',
};

function decodeEntities(s) {
  return s.replace(/&[#a-z0-9]+;/gi, (e) => ENTITIES[e] ?? e);
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const res = await fetch(URL_ARTICLE, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir Infobae`);
  const html = await res.text();

  const figRe = /<figcaption class="article-figcaption-img">([\s\S]*?)<\/figcaption>/gi;
  const imgRe =
    /src="https:\/\/www\.infobae\.com\/resizer\/v2\/([^"?]+)\.(jpg|jpeg|png)\?([^"]*)"/gi;

  const seen = new Set();
  const fotos = [];
  let fm;
  while ((fm = figRe.exec(html)) !== null) {
    const caption = decodeEntities(stripTags(fm[1]));
    // La imagen de la foto es la última que aparece antes de su epígrafe.
    const imgs = [...html.slice(0, fm.index).matchAll(imgRe)];
    if (!imgs.length) continue;
    const last = imgs[imgs.length - 1];
    const id = last[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const ext = last[2];
    const auth = new URLSearchParams(last[3]).get('auth');
    const imageUrl = `https://www.infobae.com/resizer/v2/${id}.${ext}?auth=${auth}&smart=true&width=1024&quality=85`;
    fotos.push({ id, caption, imageUrl });
  }

  const items = fotos.map((f, i) => ({
    id: i + 1,
    title: `Foto ${i + 1}`,
    description: f.caption,
    slug: `foto-${i + 1}`,
    urlOriginal: URL_ARTICLE,
    documentType: 'url',
    documentMimetype: 'image/jpeg',
    document: '',
    documentUrl: f.imageUrl,
    thumbnail: f.imageUrl,
    thumbnailUrl: f.imageUrl,
    metadata: [],
  }));

  const fuente = {
    id: 'infobae',
    nombre: 'Infobae',
    descripcion:
      'Galería fotográfica: la historia de Mar del Plata en 50 fotos imperdibles (150° aniversario).',
    url: URL_ARTICLE,
    colecciones: [
      {
        id: 'infobae-historia-50-fotos',
        name: 'La historia de Mar del Plata en 50 fotos',
        slug: 'la-historia-de-mar-del-plata-en-50-fotos',
        description:
          'Fundada el 10 de febrero de 1874, la gran urbe bonaerense está en pleno festejo de su 150 aniversario. Una galería de Infobae con imágenes de la época del modesto nacimiento, la visión de los pioneros, el tiempo dorado de "la Biarritz Argentina", los primeros bañistas y el boom turístico que la convirtió en "La ciudad Feliz".',
        itemCount: items.length,
        urlOriginal: URL_ARTICLE,
        thumbnail: fotos[0]?.imageUrl || '',
        items,
      },
    ],
  };

  await writeFile(DEST, `${JSON.stringify(fuente, null, 2)}\n`);
  console.log(`infobae.json generado: ${items.length} fotos`);
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
