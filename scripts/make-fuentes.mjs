import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Envuelve las colecciones ya descargadas (colecciones.json) en la estructura
// MARDELBACK > fuentes > colecciones, sin volver a golpear la API.
const src = fileURLToPath(new URL('../src/data/colecciones.json', import.meta.url));
const dest = fileURLToPath(new URL('../src/data/fuentes.json', import.meta.url));

const colecciones = JSON.parse(readFileSync(src, 'utf8'));

const fuentes = [
  {
    id: 'biblioteca-central-unmdp',
    nombre: 'Biblioteca Central · UNMDP',
    descripcion:
      'Repositorio de colecciones digitales de la Universidad Nacional de Mar del Plata (Tainacan).',
    url: 'https://biblio1.mdp.edu.ar/colecciones/',
    colecciones,
  },
];

writeFileSync(dest, `${JSON.stringify(fuentes, null, 2)}\n`);
console.log(`fuentes.json generado: ${fuentes.length} fuente(s), ${colecciones.length} colecciones`);
