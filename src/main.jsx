import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import './styles.css';
import { MATERIALS } from './core/materials.js';
import { DEFAULT_OPTIONS, CRITERIA, MODAL_CRITERIA } from './core/criteria.js';
import { CriteriaTab } from './ui/criteria-tab.jsx';
import { LaminateTab, makePly } from './ui/laminate-tab.jsx';
import { Tex, loadStored, store } from './ui/common.jsx';

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

function About({ dialogRef }) {
  return (
    <dialog class="about" ref={dialogRef} aria-labelledby="about-title">
      <h2 id="about-title">Как это считается</h2>
      <h3>Слой</h3>
      <p>Однонаправленный слой — ортотропный, плоское напряжённое состояние, оси 1–2 вдоль и поперёк волокон. Свойства взяты из таблицы конспекта; <Tex>{'\\nu_{21}'}</Tex> — больший коэффициент Пуассона, <Tex>{'E_1\\nu_{12}=E_2\\nu_{21}'}</Tex>. Поверхности построены в осях <Tex>{'\\sigma_1,\\ \\sigma_2,\\ \\tau_{12}'}</Tex>; на сцене каждая ось по умолчанию нормирована на свою прочность. Если снять галочку «нормирование», масштаб по всем осям станет одинаковым и будут видны реальные соотношения прочностей.</p>
      <p>Показатель <Tex>F</Tex> — величина, обратная запасу: если все напряжения умножить на <Tex>{'1/F'}</Tex>, точка попадёт на предельную поверхность.</p>
      <h3>Пакет</h3>
      <p>Рассматривается мембранное состояние, как в конспекте: <Tex>{'\\{\\sigma_x,\\sigma_y,\\tau_{xy}\\}=[A]\\{\\varepsilon_x,\\varepsilon_y,\\gamma_{xy}\\}'}</Tex>, <Tex>{'A_{mn}=\\sum \\bar B_{mn}^{(i)}\\bar h_i'}</Tex>. Изгиб не учитывается, поэтому порядок слоёв на результат не влияет.</p>
      <ol>
        <li>Все слои ортотропные. По жёсткости пакета находятся деформации, затем напряжения в осях каждого слоя.</li>
        <li>По выбранному критерию определяется слой, который разрушится первым, нагрузка и режим разрушения.</li>
        <li>Разрушилась матрица — слой переходит на нитяную модель: <Tex>{'E_2=G_{12}=\\nu=0'}</Tex>, остаётся <Tex>{'\\sigma_1=E_1\\varepsilon_1'}</Tex>. Разрушилось волокно — слой выключается.</li>
        <li>Жёсткость пересчитывается, шаги повторяются, пока пакет способен нести нагрузку. Пакет из нитяных слоёв может оказаться механизмом — тогда расчёт заканчивается.</li>
      </ol>
      <p>Нагружение пропорциональное: задаётся соотношение <Tex>{'\\sigma_x:\\sigma_y:\\tau_{xy}'}</Tex>. Между событиями всё линейно, диаграмма строится точно, без шагов по нагрузке. Остаточные температурные напряжения и расслоение не учитываются.</p>
      <p class="note">Исходный код и тесты расчётного ядра: <a href={REPO_URL} target="_blank" rel="noopener">github.com/avazar/laminate</a> (лицензия MIT). Использованы three.js, KaTeX, Preact и шрифты IBM Plex. <a href="THIRD-PARTY-LICENSES.txt" target="_blank" rel="noopener">Лицензии сторонних компонентов</a>.</p>
      <div class="about-foot"><form method="dialog"><button class="ghost-btn" type="submit">Закрыть</button></form></div>
    </dialog>
  );
}

function App() {
  const [ui, setUi] = useState(() => {
    const saved = loadStored(UI_KEY, { theme: 'light', scale: 1, tab: 'criteria', hideLeft: false, hideRight: false });
    // Ссылка вида …/index.html#laminate открывает сразу нужный раздел.
    const fromHash = location.hash.slice(1);
    return fromHash === 'criteria' || fromHash === 'laminate' ? { ...saved, tab: fromHash } : saved;
  });
  const [st, setSt] = useState(initialState);
  const [rem, setRem] = useState(16);
  const about = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = ui.theme;
    document.documentElement.style.setProperty('--scale', ui.scale);
    store(UI_KEY, ui);
    try { history.replaceState(null, '', `#${ui.tab}`); } catch (e) { /* file:// в некоторых браузерах */ }
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
  const tabs = [
    { id: 'criteria', title: 'Слой', sub: 'критерии прочности' },
    { id: 'laminate', title: 'Пакет', sub: 'прогрессивное разрушение' },
  ];

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
            <h1 class="brand-name">Ламинат</h1>
            <p class="brand-sub">лаборатория прочности композитов</p>
          </div>
        </div>
        <nav class="tabs" role="tablist" aria-label="Разделы">
          {tabs.map((t) => (
            <button type="button" role="tab" key={t.id} class="tab-btn" aria-selected={ui.tab === t.id} onClick={() => setUi((u) => ({ ...u, tab: t.id }))}>
              <b>{t.title}</b><span>{t.sub}</span>
            </button>
          ))}
        </nav>
        <div class="head-tools">
          <button type="button" class="tool-btn" aria-label="Мельче" title="Мельче" onClick={() => scaleBy(1 / 1.08)}>А−</button>
          <button type="button" class="tool-btn" aria-label="Крупнее" title="Крупнее" onClick={() => scaleBy(1.08)}>А+</button>
          <button type="button" class="tool-btn" aria-label={ui.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} title="Тема" onClick={() => setUi((u) => ({ ...u, theme: u.theme === 'dark' ? 'light' : 'dark' }))}>
            {ui.theme === 'dark'
              ? <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
              : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.8A6 6 0 016.2 2.5 6 6 0 1013.5 9.8z" fill="currentColor" /></svg>}
          </button>
          <button type="button" class="tool-btn" aria-label="Вернуть исходные настройки" title="Вернуть исходные настройки: материалы, укладку, нагрузку" onClick={() => setSt(freshState())}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8a4.8 4.8 0 108.3-3.3M11.8 1.6v3.3H8.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          <button type="button" class="tool-btn" aria-label="Как это считается" title="Как это считается" onClick={() => about.current.showModal()}>?</button>
          <a class="tool-btn" href={REPO_URL} target="_blank" rel="noopener" aria-label="Исходный код на GitHub" title="Исходный код на GitHub">
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
      <About dialogRef={about} />
    </>
  );
}

render(<App />, document.getElementById('app'));
