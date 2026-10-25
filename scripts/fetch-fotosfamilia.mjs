import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Fuente "La Capital · Fotos de Familia": blog histórico comunitario de Mar del Plata.
const URL_SITE = 'https://www.lacapitalmdp.com/contenidos/fotosfamilia/';
const API_POSTS =
  'https://www.lacapitalmdp.com/contenidos/fotosfamilia/wp-json/wp/v2/posts';
const IMG_BASE =
  'https://www.lacapitalmdp.com/contenidos/elgranalbumdemardelplata/imagenes';
const DEST = fileURLToPath(new URL('../src/data/fotosfamilia.json', import.meta.url));

const PAGES_TO_FETCH = 5; // 5 x 100 = 500 fotos

const NAMED_ENTITIES = {
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&#x27;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&hellip;': '…',
  '&laquo;': '«',
  '&raquo;': '»',
  '&ndash;': '–',
  '&mdash;': '—',
};

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint( parseInt(hex, 16)))
    .replace(/&[a-z0-9#]+;/gi, (m) => NAMED_ENTITIES[m.toLowerCase()] ?? m);
}

function htmlToPlainText(html) {
  if (!html) return '';
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtml(withBreaks)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

async function fetchPage(page) {
  const url = `${API_POSTS}?per_page=100&page=${page}&_fields=id,slug,title,content,link,date`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir página ${page} de Fotos de Familia`);
  return res.json();
}

async function main() {
  const pages = [];
  for (let p = 1; p <= PAGES_TO_FETCH; p += 1) {
    const batch = await fetchPage(p);
    pages.push(batch);
  }
  const posts = pages.flat();

  const items = posts
    .map((post) => {
      const num = decodeHtml(post.title?.rendered || '').trim();
      if (!/^\d+$/.test(num)) return null;

      const description = htmlToPlainText(post.content?.rendered || '');
      const imageUrl = `${IMG_BASE}/${num}.jpg`;

      const metadata = [
        {
          name: 'N° de foto',
          value: num,
        },
      ];

      // Extraer aportante si aparece en el texto ("Enviada por", "Remitida por", "Aporte de")
      const senderMatch = description.match(
        /(?:Enviad[ao]\s+por|Remitid[ao]\s+por|Aporte\s+de)\s*:?\s*([^\n.]+)/i,
      );
      if (senderMatch && senderMatch[1]) {
        metadata.push({
          name: 'Aporte',
          value: senderMatch[1].trim(),
        });
      }

      if (post.date) {
        metadata.push({
          name: 'Fecha de publicación',
          value: post.date.slice(0, 10),
        });
      }

      return {
        id: Number(num) || post.id,
        title: `Foto ${num}`,
        description,
        slug: `foto-${num}`,
        urlOriginal: post.link || `${URL_SITE}fotos/${num}`,
        documentType: 'url',
        documentMimetype: 'image/jpeg',
        document: '',
        documentUrl: imageUrl,
        thumbnail: imageUrl,
        thumbnailUrl: imageUrl,
        metadata,
      };
    })
    .filter(Boolean);

  const fuente = {
    id: 'fotos-familia-la-capital',
    nombre: 'Diario La Capital · Fotos de Familia',
    descripcion:
      'Archivo fotográfico colectivo de la historia marplatense impulsado por el diario La Capital con aportes de lectores y familias de Mar del Plata.',
    url: URL_SITE,
    colecciones: [
      {
        id: 'fotos-de-familia',
        name: 'Fotos de Familia (El Gran Álbum de Mar del Plata)',
        slug: 'fotos-de-familia',
        description:
          'Selección de 500 fotografías históricas enviadas por lectores y vecinos al proyecto "Fotos de Familia" del diario La Capital de Mar del Plata, con sus epígrafes e historias.',
        itemCount: items.length,
        urlOriginal: URL_SITE,
        thumbnail: items[0]?.thumbnailUrl || '',
        items,
      },
    ],
  };

  await writeFile(DEST, `${JSON.stringify(fuente, null, 2)}\n`);
  console.log(`fotosfamilia.json generado: ${items.length} fotos`);
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
