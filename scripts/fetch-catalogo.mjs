import { writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = 'https://biblio1.mdp.edu.ar/colecciones/wp-json';

const PUBLIC = path.join(ROOT, 'public');
const PDF_DIR = path.join(PUBLIC, 'pdfs');      // documentos PDF
const MEDIA_DIR = path.join(PUBLIC, 'media');   // documentos que no son PDF (imágenes…)
const COVER_DIR = path.join(PUBLIC, 'covers');  // miniaturas de ítems y colecciones
const DATA_FILE = path.join(ROOT, 'src', 'data', 'fuentes.json');
// Fuente: nivel intermedio entre MARDELBACK y las colecciones.
const FUENTE = {
  id: 'biblioteca-central-unmdp',
  nombre: 'Biblioteca Central · UNMDP',
  descripcion:
    'Repositorio de colecciones digitales de la Universidad Nacional de Mar del Plata (Tainacan).',
  url: 'https://biblio1.mdp.edu.ar/colecciones/',
};

// Un archivo individual mayor a esto se enlaza en vez de descargarse.
const MAX_MB = 400;
// En Cloudflare Pages (límite de 25 MB/archivo) los PDF grandes se enlazan en vez de copiarse.
const HOTLINK_PDFS = process.env.HOTLINK_PDFS === '1' || process.argv.includes('--hotlink-pdfs');

const log = (...a) => console.log(...a);
const mb = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(0)} KB` : `${n} B`;

const EXT_BY_MIME = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/tiff': 'tif',
};

function extFrom(mimeOrUrl, fallback = 'bin') {
  if (EXT_BY_MIME[mimeOrUrl]) return EXT_BY_MIME[mimeOrUrl];
  const m = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(mimeOrUrl || '');
  return m ? m[1].toLowerCase() : fallback;
}

async function fetchJson(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

async function getCollections() {
  const cols = await fetchJson(`${API}/tainacan/v2/collections?perpage=100`);
  return cols.filter((c) => c.status === 'publish');
}

async function getItems(collectionId) {
  const all = [];
  const seen = new Set();
  let page = 1;
  let totalPages = null;
  for (;;) {
    const res = await fetch(
      `${API}/tainacan/v2/collection/${collectionId}/items?perpage=100&paged=${page}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} (colección ${collectionId}, pág ${page})`);
    const headerTotalPages = res.headers.get('x-wp-totalpages');
    if (headerTotalPages) totalPages = Math.max(parseInt(headerTotalPages, 10) || 1, totalPages ?? 1);
    const data = await res.json();
    const items = data.items ?? [];
    let nuevos = 0;
    for (const it of items) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        all.push(it);
        nuevos += 1;
      }
    }
    if (items.length === 0 || nuevos === 0) break;
    if (totalPages !== null && page >= totalPages) break;
    if (totalPages === null && items.length < 100) break;
    page += 1;
    if (page > 200) break;
  }
  return all.filter((it) => it.status === 'publish');
}

async function mediaInfo(attachmentId) {
  try {
    return await fetchJson(`${API}/wp/v2/media/${attachmentId}`);
  } catch {
    return null;
  }
}

async function remoteSize(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!res.ok) return 0;
    const len = res.headers.get('content-length');
    return len ? parseInt(len, 10) : 0;
  } catch {
    return 0;
  }
}

async function downloadTo(url, dest) {
  if (existsSync(dest)) {
    const s = await stat(dest);
    if (s.size > 0) return { size: s.size, skipped: true };
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return { size: buf.length, skipped: false };
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function metadataList(item) {
  const out = [];
  for (const v of Object.values(item.metadata ?? {})) {
    const value = (v.value_as_string ?? '').trim();
    if (!value) continue;
    if (v.name === 'Título') continue; // ya es el título del ítem
    out.push({ name: v.name, value });
  }
  return out;
}

async function main() {
  await mkdir(PDF_DIR, { recursive: true });
  await mkdir(MEDIA_DIR, { recursive: true });
  await mkdir(COVER_DIR, { recursive: true });
  await mkdir(path.dirname(DATA_FILE), { recursive: true });

  log('Consultando colecciones…');
  const collections = await getCollections();
  log(`Colecciones publicadas: ${collections.length}`);

  const result = [];

  for (const col of collections) {
    const expected = col.total_items?.publish ?? 0;
    log(`\n=== ${col.name} (id ${col.id}) — esperados: ${expected} ===`);
    const items = await getItems(col.id);
    log(`  obtenidos: ${items.length}${expected && items.length !== expected ? `  ⚠ faltan ${expected - items.length}` : ''}`);

    // Miniatura de la colección
    let colThumb = '';
    try {
      const candidateId = col._thumbnail_id;
      const candidateUrl = col.header_image;
      if (candidateId) {
        const m = await mediaInfo(candidateId);
        if (m?.source_url) {
          const ext = extFrom(m.mime_type || m.source_url);
          const dest = path.join(COVER_DIR, `coleccion-${col.id}.${ext}`);
          await downloadTo(m.source_url, dest);
          colThumb = `/covers/coleccion-${col.id}.${ext}`;
        }
      } else if (candidateUrl && typeof candidateUrl === 'string') {
        const ext = extFrom(candidateUrl);
        const dest = path.join(COVER_DIR, `coleccion-${col.id}.${ext}`);
        await downloadTo(candidateUrl, dest);
        colThumb = `/covers/coleccion-${col.id}.${ext}`;
      }
    } catch (e) {
      log(`  ⚠ miniatura de colección: ${e.message}`);
    }

    const records = [];
    for (const item of items) {
      // Documento
      let docUrl = '';
      let docMime = item.document_mimetype || '';
      if (item.document_type === 'url' && typeof item.document === 'string') {
        docUrl = item.document;
      } else if (item.document && item.document_type === 'attachment') {
        const m = await mediaInfo(item.document);
        if (m) {
          docUrl = m.source_url || '';
          docMime = m.mime_type || docMime;
        }
      }

      // Miniatura
      let thumbUrl = '';
      let thumbMime = '';
      if (item._thumbnail_id) {
        const m = await mediaInfo(item._thumbnail_id);
        if (m) {
          thumbUrl = m.source_url || '';
          thumbMime = m.mime_type || '';
        }
      }

      const metas = metadataList(item);
      const fallbackTitle = metas.find((m) => m.name !== 'Descripción')?.value ?? '';
      const title = (item.title || '').trim() || fallbackTitle || 'Sin título';

      records.push({
        id: item.id,
        title,
        description: item.description || '',
        slug: item.slug,
        urlOriginal: item.url || '',
        documentType: item.document_type || '',
        documentMimetype: docMime,
        docUrl,
        thumbUrl,
        thumbMime,
        metadata: metas,
        document: '',
        documentUrl: docUrl,
        thumbnail: '',
        thumbnailUrl: thumbUrl,
      });
    }

    // Descargas (documento + miniatura)
    await mapLimit(records, 4, async (rec) => {
      if (rec.docUrl) {
        const isPdf = /pdf/i.test(rec.documentMimetype) || /\.pdf$/i.test(rec.docUrl.split('?')[0]);
        if (isPdf && HOTLINK_PDFS) {
          log(`  ⤴ #${rec.id}: PDF enlazado (sin copia local)`);
        } else {
          try {
            const size = await remoteSize(rec.docUrl);
            if (size > MAX_MB * 1024 * 1024) {
              log(`  ⚠ #${rec.id}: documento ${mb(size)} > ${MAX_MB} MB → se enlaza`);
            } else {
              const ext = isPdf ? 'pdf' : extFrom(rec.documentMimetype || rec.docUrl);
              const dir = isPdf ? PDF_DIR : MEDIA_DIR;
              const dest = path.join(dir, `${rec.id}.${ext}`);
              const r = await downloadTo(rec.docUrl, dest);
              rec.document = `${isPdf ? '/pdfs' : '/media'}/${rec.id}.${ext}`;
              log(`  ✔ #${rec.id} document (${mb(r.size)})${r.skipped ? ' [existente]' : ''}`);
            }
          } catch (e) {
            log(`  ✖ #${rec.id} documento: ${e.message}`);
          }
        }
      }

      const sameAsDoc = rec.thumbUrl && rec.docUrl && rec.thumbUrl === rec.docUrl;
      if (sameAsDoc) {
        rec.thumbnail = rec.document;
      } else if (rec.thumbUrl) {
        try {
          const ext = extFrom(rec.thumbMime || rec.thumbUrl);
          const dest = path.join(COVER_DIR, `${rec.id}.${ext}`);
          const r = await downloadTo(rec.thumbUrl, dest);
          rec.thumbnail = `/covers/${rec.id}.${ext}`;
          log(`  ✔ #${rec.id} miniatura (${mb(r.size)})${r.skipped ? ' [existente]' : ''}`);
        } catch (e) {
          log(`  ✖ #${rec.id} miniatura: ${e.message}`);
        }
      }
    });

    const cleaned = records.map(({ docUrl, thumbUrl, thumbMime, ...rest }) => rest);
    result.push({
      id: col.id,
      name: col.name,
      slug: col.slug,
      description: col.description || '',
      itemCount: items.length,
      urlOriginal: col.url || '',
      thumbnail: colThumb,
      items: cleaned,
    });
  }

  const fuentes = [{ ...FUENTE, colecciones: result }];

  await writeFile(DATA_FILE, `${JSON.stringify(fuentes, null, 2)}\n`, 'utf8');

  const totalItems = result.reduce((a, c) => a + c.items.length, 0);
  const conDoc = result.reduce((a, c) => a + c.items.filter((i) => i.document).length, 0);
  const conThumb = result.reduce((a, c) => a + c.items.filter((i) => i.thumbnail).length, 0);

  log(`\n✔ ${result.length} colecciones · ${totalItems} ítems`);
  log(`   documentos locales: ${conDoc}/${totalItems} · miniaturas: ${conThumb}/${totalItems}`);
  log(`   → ${DATA_FILE}`);
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
