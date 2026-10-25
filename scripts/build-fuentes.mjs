import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Combina las fuentes disponibles (un archivo por fuente) en src/data/fuentes.json.
// Orden: primero UNMDP (la fuente base), luego las demás.
const ORDER = ['unmdp', 'infobae'];

const dataPath = (name) => fileURLToPath(new URL(`../src/data/${name}`, import.meta.url));

const fuentes = [];
for (const base of ORDER) {
  const file = dataPath(`${base}.json`);
  if (!existsSync(file)) {
    console.warn(`Falta ${base}.json, se omite.`);
    continue;
  }
  fuentes.push(JSON.parse(readFileSync(file, 'utf8')));
}

if (fuentes.length === 0) {
  throw new Error('No hay fuentes para combinar (corré primero los extractores).');
}

writeFileSync(dataPath('fuentes.json'), `${JSON.stringify(fuentes, null, 2)}\n`);
console.log(
  `fuentes.json: ${fuentes.length} fuente(s) -> ${fuentes.map((f) => f.nombre).join(', ')}`,
);
