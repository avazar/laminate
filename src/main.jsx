import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import './styles.css';
import { MATERIALS } from './core/materials.js';
import { DEFAULT_OPTIONS, CRITERIA, MODAL_CRITERIA } from './core/criteria.js';
import { CriteriaTab } from './ui/criteria-tab.jsx';
import { LaminateTab, makePly } from './ui/laminate-tab.jsx';
import { Tex, loadStored, store } from './ui/common.jsx';
import { tr, setLang, initialLang } from './i18n.js';

const REPO_URL = 'https://github.com/avazar/laminate';
const STATE_KEY = 'laminate.state.v1';
const UI_KEY = 'laminate.ui';
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const freshState = () => ({
  materials: MATERIALS.map((m) => ({ ...m })),
  options: { ...DEFAULT_OPTIONS },
  crit: {
    materialId: 'carbon', focusId: 'tsaiWu', visible: { maxStress: true, tsaiWu: true, hashin: true },
    probe: [900, 20, 25], colorByMode: true, topo: true, normalize: true, autoRotate: !reducedMotion,
  },
  lam: {
    plies: [0, 45, -45, 90].map((a) => makePly('carbon', a)),
    load: [1, 0, 0], criterionId: 'hashin', hashinAlpha: 0, control: 'strain', show: [true, true, false],
  },
});

function initialState() {
  const fresh = freshState();
  const saved = loadStored(STATE_KEY, {});
  // Сохранённое состояние принимается только если оно согласовано с текущей версией данных.
  const ok = saved.materials && saved.materials.length === MATERIALS.length && saved.materials.every((m, i) => m.id === MATERIALS[i].id)
    && saved.lam && Array.isArray(saved.lam.plies) && saved.lam.plies.length > 0 && saved.lam.plies.every((p) => MATERIALS.some((m) => m.id === p.materialId))
    && saved.crit && CRITERIA.some((c) => c.id === saved.crit.focusId) && MODAL_CRITERIA.some((c) => c.id === saved.lam.criterionId);
  if (!ok) return fresh;
  return {
    materials: saved.materials,
    options: { ...fresh.options, ...saved.options },
    crit: { ...fresh.crit, ...saved.crit, autoRotate: false },
    lam: { ...fresh.lam, ...saved.lam },
  };
}

// Формулы, общие для обеих языковых версий окна «Как это считается».
const F = {
  nu: '\\nu_{21}',
  nuRel: 'E_1\\nu_{12}=E_2\\nu_{21}',
  axes: '\\sigma_1,\\ \\sigma_2,\\ \\tau_{12}',
  invF: '1/F',
  hooke: '\\{\\sigma_x,\\sigma_y,\\tau_{xy}\\}=[A]\\{\\varepsilon_x,\\varepsilon_y,\\gamma_{xy}\\}',
  A: 'A_{mn}=\\sum \\bar B_{mn}^{(i)}\\bar h_i',
  netting: 'E_2=G_{12}=\\nu=0',
  fiber: '\\sigma_1=E_1\\varepsilon_1',
  ratio: '\\sigma_x:\\sigma_y:\\tau_{xy}',
};
const repoLink = <a href={REPO_URL} target="_blank" rel="noopener">github.com/avazar/laminate</a>;

function AboutRu() {
  return (
    <>
      <h2 id="about-title">Как это считается</h2>
      <h3>Слой</h3>
      <p>Однонаправленный слой — ортотропный, плоское напряжённое состояние, оси 1–2 вдоль и поперёк волокон. Свойства материалов — типовые значения для однонаправленных слоёв; <Tex>{F.nu}</Tex> — больший коэффициент Пуассона, <Tex>{F.nuRel}</Tex>. Поверхности построены в осях <Tex>{F.axes}</Tex>; на сцене каждая ось по умолчанию нормирована на свою прочность. Если снять галочку «нормирование», масштаб по всем осям станет одинаковым и будут видны реальные соотношения прочностей.</p>
      <p>Показатель <Tex>F</Tex> — величина, обратная запасу: если все напряжения умножить на <Tex>{F.invF}</Tex>, точка попадёт на предельную поверхность.</p>
      <h3>Пакет</h3>
      <p>Рассматривается мембранное состояние: <Tex>{F.hooke}</Tex>, <Tex>{F.A}</Tex>. Изгиб не учитывается, поэтому порядок слоёв на результат не влияет.</p>
      <ol>
        <li>Все слои ортотропные. По жёсткости пакета находятся деформации, затем напряжения в осях каждого слоя.</li>
        <li>По выбранному критерию определяется слой, который разрушится первым, нагрузка и режим разрушения.</li>
        <li>Разрушилась матрица — слой переходит на нитяную модель: <Tex>{F.netting}</Tex>, остаётся <Tex>{F.fiber}</Tex>. Разрушилось волокно — слой выключается.</li>
        <li>Жёсткость пересчитывается, шаги повторяются, пока пакет способен нести нагрузку. Пакет из нитяных слоёв может оказаться механизмом — тогда расчёт заканчивается.</li>
      </ol>
      <p>Нагружение пропорциональное: задаётся соотношение <Tex>{F.ratio}</Tex>. Между событиями всё линейно, диаграмма строится точно, без шагов по нагрузке. Остаточные температурные напряжения и расслоение не учитываются.</p>
      <p class="note">Исходный код и тесты расчётного ядра: {repoLink} (лицензия MIT). Использованы three.js, KaTeX, Preact и шрифты IBM Plex. <a href="THIRD-PARTY-LICENSES.txt" target="_blank" rel="noopener">Лицензии сторонних компонентов</a>.</p>
      <p class="disclaimer">Сайт создан в учебных целях. Модели упрощены, свойства материалов — типовые, поэтому результаты могут быть неточными и не годятся для проектных расчётов.</p>
    </>
  );
}

function AboutEn() {
  return (
    <>
      <h2 id="about-title">How it is computed</h2>
      <h3>Ply</h3>
      <p>A unidirectional ply is orthotropic and in plane stress; axes 1–2 run along and across the fibers. The material properties are typical values for unidirectional plies. Mind the index convention: <Tex>{F.nu}</Tex> is the major Poisson's ratio, <Tex>{F.nuRel}</Tex>. The surfaces are drawn in the axes <Tex>{F.axes}</Tex>; by default each axis of the scene is normalized by its own strength. Clear the “normalize” box to give all axes the same scale and see the real strength ratios.</p>
      <p>The index <Tex>F</Tex> is the reciprocal of the safety factor: multiplying all stresses by <Tex>{F.invF}</Tex> puts the point on the failure surface.</p>
      <h3>Laminate</h3>
      <p>The laminate is treated as a membrane: <Tex>{F.hooke}</Tex>, <Tex>{F.A}</Tex>. Bending is neglected, so the stacking order does not affect the result.</p>
      <ol>
        <li>All plies are orthotropic. The laminate stiffness gives the strains, then the stresses in the axes of each ply.</li>
        <li>The chosen criterion gives the ply that fails first, the load and the failure mode.</li>
        <li>Matrix failure switches the ply to the netting model: <Tex>{F.netting}</Tex>, only <Tex>{F.fiber}</Tex> remains. Fiber failure removes the ply.</li>
        <li>The stiffness is recomputed and the steps repeat while the laminate can carry the load. A laminate of netting plies may turn out to be a mechanism; the analysis then stops.</li>
      </ol>
      <p>Loading is proportional: the ratio <Tex>{F.ratio}</Tex> is prescribed. Between events everything is linear, so the curve is exact, with no load stepping. Residual thermal stresses and delamination are not considered.</p>
      <p class="note">Source code and solver tests: {repoLink} (MIT license). Built with three.js, KaTeX, Preact and the IBM Plex fonts. <a href="THIRD-PARTY-LICENSES.txt" target="_blank" rel="noopener">Third-party licenses</a>.</p>
      <p class="disclaimer">This site is an educational tool. The models are simplified and the material properties are typical values, so the results may be inaccurate and must not be used for design.</p>
    </>
  );
}

function About({ dialogRef, lang }) {
  return (
    <dialog class="about" ref={dialogRef} aria-labelledby="about-title">
      {lang === 'en' ? <AboutEn /> : <AboutRu />}
      <div class="about-foot"><form method="dialog"><button class="ghost-btn" type="submit">{tr('word.close')}</button></form></div>
    </dialog>
  );
}

function App() {
  const [ui, setUi] = useState(() => {
    const saved = loadStored(UI_KEY, { theme: 'light', scale: 1, tab: 'criteria', hideLeft: false, hideRight: false });
    // Ссылка вида …/index.html#laminate открывает сразу нужный раздел, а …/?lang=en — английскую версию.
    const fromHash = location.hash.slice(1);
    return { ...saved, lang: initialLang(saved.lang), tab: fromHash === 'criteria' || fromHash === 'laminate' ? fromHash : saved.tab };
  });
  const [st, setSt] = useState(initialState);
  const [rem, setRem] = useState(16);
  const about = useRef(null);
  // Язык нужен функциям tr() и fmt() уже при отрисовке дочерних компонентов.
  setLang(ui.lang);

  useEffect(() => {
    document.documentElement.dataset.theme = ui.theme;
    document.documentElement.style.setProperty('--scale', ui.scale);
    document.documentElement.lang = ui.lang;
    document.title = tr('app.title');
    store(UI_KEY, ui);
    // Адрес повторяет текущий раздел и язык, чтобы ссылкой можно было поделиться.
    try { history.replaceState(null, '', `${location.pathname}${ui.lang === 'en' ? '?lang=en' : ''}#${ui.tab}`); } catch (e) { /* file:// в некоторых браузерах */ }
    const measure = () => setRem(parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ui]);
  useEffect(() => { store(STATE_KEY, st); }, [st]);

  // Боковые панели сворачиваются ручками на их границах и клавишами [ и ] — остаётся только центр.
  const panels = { hideLeft: !!ui.hideLeft, hideRight: !!ui.hideRight, toggle: (key) => setUi((u) => ({ ...u, [key]: !u[key] })) };
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
      // e.code не зависит от раскладки: на русской эти клавиши — «х» и «ъ»
      if (e.code === 'BracketLeft') panels.toggle('hideLeft');
      else if (e.code === 'BracketRight') panels.toggle('hideRight');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const part = (key) => (v) => setSt((s) => ({ ...s, [key]: typeof v === 'function' ? v(s[key]) : v }));
  const scaleBy = (k) => setUi((u) => ({ ...u, scale: Math.min(1.6, Math.max(0.7, +(u.scale * k).toFixed(3))) }));
  const tabs = ['criteria', 'laminate'];

  return (
    <>
      <header class="app-head">
        <div class="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 5l13 6-13 6-13-6z" fill="var(--m-glass)" stroke="var(--ink)" stroke-width="1.4" stroke-linejoin="round" />
            <path d="M3 16l13 6 13-6" fill="none" stroke="var(--m-aramid)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
            <path d="M3 21l13 6 13-6" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
          <div>
            <h1 class="brand-name">{tr('brand.name')}</h1>
            <p class="brand-sub">{tr('brand.sub')}</p>
          </div>
        </div>
        <nav class="tabs" role="tablist" aria-label={tr('nav.label')}>
          {tabs.map((id) => (
            <button type="button" role="tab" key={id} class="tab-btn" aria-selected={ui.tab === id} onClick={() => setUi((u) => ({ ...u, tab: id }))}>
              <b>{tr(`tab.${id}.title`)}</b><span>{tr(`tab.${id}.sub`)}</span>
            </button>
          ))}
        </nav>
        <div class="head-tools">
          <button type="button" class="tool-btn" lang={ui.lang === 'en' ? 'ru' : 'en'} aria-label={tr('tool.langTitle')} title={tr('tool.langTitle')} onClick={() => setUi((u) => ({ ...u, lang: u.lang === 'en' ? 'ru' : 'en' }))}>{tr('tool.lang')}</button>
          <button type="button" class="tool-btn" aria-label={tr('tool.smaller')} title={tr('tool.smaller')} onClick={() => scaleBy(1 / 1.08)}>{tr('tool.font')}−</button>
          <button type="button" class="tool-btn" aria-label={tr('tool.larger')} title={tr('tool.larger')} onClick={() => scaleBy(1.08)}>{tr('tool.font')}+</button>
          <button type="button" class="tool-btn" aria-label={tr(ui.theme === 'dark' ? 'tool.lightTheme' : 'tool.darkTheme')} title={tr('tool.theme')} onClick={() => setUi((u) => ({ ...u, theme: u.theme === 'dark' ? 'light' : 'dark' }))}>
            {ui.theme === 'dark'
              ? <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
              : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.8A6 6 0 016.2 2.5 6 6 0 1013.5 9.8z" fill="currentColor" /></svg>}
          </button>
          <button type="button" class="tool-btn" aria-label={tr('tool.reset')} title={tr('tool.resetTitle')} onClick={() => setSt(freshState())}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8a4.8 4.8 0 108.3-3.3M11.8 1.6v3.3H8.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          <button type="button" class="tool-btn" aria-label={tr('tool.about')} title={tr('tool.about')} onClick={() => about.current.showModal()}>?</button>
          <a class="tool-btn" href={REPO_URL} target="_blank" rel="noopener" aria-label={tr('tool.github')} title={tr('tool.github')}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" /></svg>
          </a>
        </div>
      </header>
      <main>
        <CriteriaTab
          active={ui.tab === 'criteria'} materials={st.materials} setMaterials={part('materials')} options={st.options} setOptions={part('options')}
          state={st.crit} setState={part('crit')} rem={rem} theme={ui.theme} panels={panels}
        />
        <LaminateTab
          active={ui.tab === 'laminate'} materials={st.materials} state={st.lam} setState={part('lam')} rem={rem} panels={panels}
        />
      </main>
      <About dialogRef={about} lang={ui.lang} />
    </>
  );
}

render(<App />, document.getElementById('app'));
