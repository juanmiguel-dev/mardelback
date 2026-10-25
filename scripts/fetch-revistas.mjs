import { writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = 'https://biblio1.mdp.edu.ar/colecciones/wp-json';
const COLLECTION_ID = 1423;

const PDF_DIR = path.join(ROOT, 'public', 'pdfs');
const COVER_DIR = path.join(ROOT, 'public', 'covers');
const DATA_FILE = path.join(ROOT, 'src', 'data', 'revistas.json');

// Mapeo id de metadato (estable) -> campo de nuestro JSON
const META_BY_ID = {
  1426: 'titulo',
  1441: 'lugarEdicion',
  1446: 'editor',
  1433: 'enumeracion',
  1436: 'anio',
  1428: 'descripcion',
  1430: 'tema',
  1452: 'derechos',
};

const log = (...a) => console.log(...a);

async function fetchJson(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function fetchAllItems() {
  const all = [];
  let page = 1;
  for (;;) {
    const data = await fetchJson(
      `${API}/tainacan/v2/collection/${COLLECTION_ID}/items?perpage=100&paged=${page}`,
    );
    const items = data.items ?? [];
    all.push(...items);
    if (items.length < 100) break;
    page += 1;
  }
  return all.filter((it) => it.status === 'publish');
}

async function downloadTo(url, dest) {
  if (existsSync(dest)) {
    const s = await stat(dest);
    if (s.size > 0) return s.size; // ya descargado
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf.length;
}

function imageExt(mime, url) {
  const byMime = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  if (byMime[mime]) return byMime[mime];
  const m = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(url);
  return m ? m[1].toLowerCase() : 'jpg';
}

function mb(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
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

async function main() {
  await mkdir(PDF_DIR, { recursive: true });
  await mkdir(COVER_DIR, { recursive: true });
  await mkdir(path.dirname(DATA_FILE), { recursive: true });

  log('Consultando colección "Revistas" (id 1423)…');
  const items = await fetchAllItems();
  log(`Ítems publicados: ${items.length}`);

  // Fase 1 — resolver URLs de PDF y portada (rápido)
  log('Resolviendo URLs de PDF y portadas…');
  const records = [];
  for (const item of items) {
    const meta = {};
    for (const v of Object.values(item.metadata ?? {})) {
      const key = META_BY_ID[v.id];
      if (!key) continue;
      meta[key] =
        v.multiple === 'yes'
          ? Array.isArray(v.value)
            ? v.value
            : v.value
              ? [v.value]
              : []
          : (v.value_as_string ?? v.value ?? '');
    }

    const rec = {
      id: item.id,
      slug: item.slug,
      titulo: item.title || meta.titulo || '',
      descripcion: meta.descripcion || item.description || '',
      lugarEdicion: meta.lugarEdicion || '',
      editor: meta.editor || '',
      enumeracion: meta.enumeracion || '',
      anio: meta.anio || '',
      tema: meta.tema || [],
      derechos: meta.derechos || '',
      urlOriginal: item.url || '',
      pdf: '',
      pdfNombre: '',
      pdfTamanoBytes: 0,
      portada: '',
      pdfUrl: '',
      coverUrl: '',
      coverExt: 'jpg',
    };

    if (item.document) {
      try {
        const media = await fetchJson(`${API}/wp/v2/media/${item.document}`);
        rec.pdfUrl = media.source_url || '';
        rec.pdfNombre = media.filename || path.basename(rec.pdfUrl);
        rec.pdfTamanoBytes = media.filesize || 0;
      } catch (e) {
        log(`  ⚠ #${item.id}: PDF no resuelto (${e.message})`);
      }
    }
    if (item._thumbnail_id) {
      try {
        const media = await fetchJson(`${API}/wp/v2/media/${item._thumbnail_id}`);
        rec.coverUrl = media.source_url || '';
        rec.coverExt = imageExt(media.mime_type || '', rec.coverUrl);
      } catch (e) {
        log(`  ⚠ #${item.id}: portada no resuelta (${e.message})`);
      }
    }
    records.push(rec);
  }

  // Fase 2 — descargas en paralelo
  log('Descargando PDFs y portadas (con 4 descargas simultáneas)…');
  await mapLimit(records, 4, async (rec) => {
    if (rec.pdfUrl) {
      try {
        const size = await downloadTo(rec.pdfUrl, path.join(PDF_DIR, `${rec.id}.pdf`));
        rec.pdf = `/pdfs/${rec.id}.pdf`;
        log(`  ✔ PDF #${rec.id} "${rec.titulo}" (${mb(size)})`);
      } catch (e) {
        log(`  ✖ PDF #${rec.id} "${rec.titulo}": ${e.message}`);
      }
    }
    if (rec.coverUrl) {
      try {
        const dest = path.join(COVER_DIR, `${rec.id}.${rec.coverExt}`);
        await downloadTo(rec.coverUrl, dest);
        rec.portada = `/covers/${rec.id}.${rec.coverExt}`;
        log(`  ✔ portada #${rec.id}`);
      } catch (e) {
        log(`  ✖ portada #${rec.id}: ${e.message}`);
      }
    }
  });

  // Quitar campos internos y ordenar
  const final = records
    .map(({ pdfUrl, coverUrl, coverExt, ...rest }) => rest)
    .sort(
      (a, b) =>
        a.titulo.localeCompare(b.titulo, 'es') ||
        (a.anio || '').localeCompare(b.anio || '') ||
        a.id - b.id,
    );

  await writeFile(DATA_FILE, `${JSON.stringify(final, null, 2)}\n`, 'utf8');
  log(`\n✔ ${final.length} revistas indexadas → ${DATA_FILE}`);
  log(`   PDFs: ${final.filter((r) => r.pdf).length}/${final.length} · Portadas: ${final.filter((r) => r.portada).length}/${final.length}`);
}

main().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
