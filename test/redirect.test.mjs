import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../redirect/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Redirect script must be present');
const target = 'https://avazar.github.io/composite/strength/';

for (const suffix of ['', '?lang=en', '?lang=ru', '#criteria', '#laminate', '?lang=en#laminate', '?lang=ru#criteria', '?lang=en&example=1%2F2#laminate']) {
  test(`старая ссылка ${suffix || '/'} сохраняет язык, вкладку и остальные параметры`, () => {
    const from = new URL(`https://avazar.github.io/laminate/${suffix}`);
    const visits = [];
    runInNewContext(script, { window: { location: {
      search: from.search, hash: from.hash,
      replace: (url) => visits.push(url),
    } } });
    assert.deepEqual(visits, [target + suffix]);
  });
}

test('адрес /laminate/index.html также переходит непосредственно в тему', () => {
  const from = new URL('https://avazar.github.io/laminate/index.html?lang=en#criteria');
  let destination;
  runInNewContext(script, { window: { location: { search: from.search, hash: from.hash, replace: (url) => { destination = url; } } } });
  assert.equal(destination, target + '?lang=en#criteria');
});

test('canonical и обычные ссылки доступны без JavaScript', () => {
  assert.ok(html.includes(`<link rel="canonical" href="${target}">`));
  assert.ok(html.includes(`<a href="${target}">`));
  assert.ok(html.includes(`<a href="${target}?lang=en">`));
});
