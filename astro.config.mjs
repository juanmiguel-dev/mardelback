import { defineConfig } from 'astro/config';

// En GitHub Pages el sitio se publica en /<repo>/. Localmente se sirve en la raíz.
const githubPages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  site: 'https://juanmiguel-dev.github.io',
  base: githubPages ? '/mardelback' : '/',
  output: 'static',
  trailingSlash: 'always',
});
