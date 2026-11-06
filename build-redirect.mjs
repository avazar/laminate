// Публикуем только страницу перехода. Прежняя лаборатория сохранена в src/.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const outdir = new URL('site-redirect/', import.meta.url);
await mkdir(outdir, { recursive: true });
await copyFile(new URL('redirect/index.html', import.meta.url), new URL('index.html', outdir));
await writeFile(new URL('.nojekyll', outdir), '');
console.log('Redirect built in site-redirect/');
