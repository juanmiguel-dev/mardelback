import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../src/data/colecciones.json', import.meta.url));
const data = JSON.parse(readFileSync(file, 'utf8'));

let count = 0;
for (const coleccion of data) {
  for (const item of coleccion.items) {
    if (/pdf/i.test(item.documentMimetype || '') && item.documentUrl) {
      item.document = ''; // enlaza al PDF original en vez de copiarlo
      count += 1;
    }
  }
}

writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`PDFs enlazados (sin copia local): ${count}`);
