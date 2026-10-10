# Ламинат · лаборатория прочности

[English version below](#laminate--strength-lab)

Учебный сайт о критериях прочности и прогрессивном разрушении слоистых композитов: **https://avazar.github.io/laminate/**

- **Слой.** Предельные поверхности в осях σ₁, σ₂, τ₁₂ для семи критериев (максимальных напряжений, аппроксимационного по В. В. Васильеву, Цая–Ву, Хашина, максимальных деформаций, Цая–Хилла, Хоффмана) и три среза: σ₁–σ₂, σ₁–τ₁₂, σ₂–τ₁₂.
- **Пакет.** Укладка из слоёв разных материалов, пропорциональная нагрузка σx : σy : τxy, расчёт прогрессивного разрушения и диаграмма деформирования. Разрушение слоя определяется по одному из критериев, различающих волокно и матрицу: максимальных напряжений, аппроксимационному, Хашина, максимальных деформаций.

Ссылка `https://avazar.github.io/laminate/#laminate` открывает сразу вкладку «Пакет», а `https://avazar.github.io/laminate/?lang=en` — английскую версию. Язык переключается и кнопкой EN / RU в шапке.

Сайт создан в учебных целях. Модели упрощены, свойства материалов — типовые, поэтому результаты могут быть неточными и не годятся для проектных расчётов.

## Как собрать у себя

Нужен Node.js 18 или новее.

```bash
npm install
```

```bash
npm run build
```

```bash
npm test
```

`npm run build` создаёт папку `site/` — обычный статический сайт. Его можно открыть двойным кликом по `site/index.html`: интернет не нужен, библиотеки и шрифты лежат внутри. `npm test` проверяет расчётное ядро: формулы жёсткости, критерии, алгоритм разрушения.

Сайт на GitHub Pages обновляется сам: при каждом изменении ветки `dev` GitHub запускает тесты, сборку и публикацию (`.github/workflows/pages.yml`).

## Где что лежит

| Файл | Содержание |
|---|---|
| `src/core/materials.js` | Свойства материалов: стеклопластик, органопластик, углепластик |
| `src/core/mech.js` | Закон Гука для слоя, преобразования поворота, жёсткость пакета A = Σ B̄ᵢh̄ᵢ |
| `src/core/criteria.js` | Семь критериев прочности |
| `src/core/progressive.js` | Алгоритм прогрессивного разрушения |
| `src/core/contour.js`, `src/core/bounds.js` | Линии срезов и габариты поверхностей |
| `src/viz/surface3d.js` | Трёхмерная сцена (three.js) |
| `src/ui/` | Интерфейс (Preact) |
| `src/i18n.js` | Тексты интерфейса на русском и английском |

## Принятые допущения

- Оси слоя 1–2, оси пакета x–y, ν₂₁ — больший коэффициент Пуассона (E₁ν₁₂ = E₂ν₂₁).
- Пакет рассматривается в мембранной постановке, без изгиба; порядок слоёв на результат не влияет.
- Показатель F — величина, обратная запасу прочности: при умножении всех напряжений на 1/F точка попадает на предельную поверхность.
- Разрушение матрицы переводит слой на нитяную модель (E₂ = G₁₂ = ν = 0), разрушение волокна выключает слой.
- Между событиями задача линейна, поэтому диаграмма строится точно, без шагов по нагрузке. «Жёсткое» нагружение удерживает деформацию в направлении нагрузки, «мягкое» — саму нагрузку.
- Для критерия максимальных деформаций предельные деформации приняты ε̄ = σ̄/E.
- В критерии Хашина прочность на поперечный сдвиг τ̄₂₃ принята равной σ̄₂⁻/2. Параметр α (вклад сдвига в разрушение волокна) на вкладке «Слой» по умолчанию равен 1, в расчёте пакета — 0, чтобы сдвиг не выключал слой целиком.
- Остаточные температурные напряжения и расслоение не учитываются.

## Лицензия

Код сайта распространяется по лицензии MIT, см. файл [LICENSE](LICENSE).

Сторонние компоненты: three.js, KaTeX, Preact (MIT), шрифты IBM Plex (SIL OFL 1.1). Тексты их лицензий сборка кладёт в `site/THIRD-PARTY-LICENSES.txt`.

---

# Laminate · strength lab

An educational site on failure criteria and progressive failure of composite laminates: **https://avazar.github.io/laminate/?lang=en**

- **Ply.** Failure surfaces in the axes σ₁, σ₂, τ₁₂ for seven criteria (maximum stress, the approximation criterion from V. V. Vasiliev's book, Tsai–Wu, Hashin, maximum strain, Tsai–Hill, Hoffman) and three sections: σ₁–σ₂, σ₁–τ₁₂, σ₂–τ₁₂.
- **Laminate.** A layup of plies of different materials, proportional loading σx : σy : τxy, progressive failure analysis and the stress–strain curve. Ply failure is detected by one of the criteria that tell fiber from matrix: maximum stress, approximation, Hashin, maximum strain.

The language is switched by the EN / RU button in the header; `?lang=en` in the address opens the English version directly, and `#laminate` opens the Laminate tab.

This site is an educational tool. The models are simplified and the material properties are typical values, so the results may be inaccurate and must not be used for design.

## Build

Node.js 18 or newer is required.

```bash
npm install
```

```bash
npm run build
```

```bash
npm test
```

`npm run build` creates the `site/` folder, a plain static site that also opens from disk by double-clicking `site/index.html` (no internet needed). `npm test` checks the solver: stiffness formulas, criteria, the failure algorithm. Every push to the `dev` branch runs the tests, the build and the GitHub Pages deployment.

## Assumptions

- Ply axes 1–2, laminate axes x–y. Note the index convention: ν₂₁ is the major Poisson's ratio (E₁ν₁₂ = E₂ν₂₁).
- The laminate is a membrane, bending is neglected; the stacking order does not affect the result.
- The index F is the reciprocal of the safety factor: multiplying all stresses by 1/F puts the point on the failure surface.
- Matrix failure switches the ply to the netting model (E₂ = G₁₂ = ν = 0); fiber failure removes the ply.
- Between events the problem is linear, so the curve is exact, with no load stepping. Strain control holds the strain in the load direction, load control holds the load.
- For the maximum strain criterion the ultimate strains are taken as ε̄ = σ̄/E.
- In the Hashin criterion the transverse shear strength τ̄₂₃ is taken as σ̄₂⁻/2. The parameter α (shear contribution to fiber failure) defaults to 1 on the Ply tab and to 0 in the laminate analysis, so that shear does not remove a ply completely.
- Residual thermal stresses and delamination are not considered.

## License

The code is released under the MIT license, see [LICENSE](LICENSE). Third-party components: three.js, KaTeX, Preact (MIT), IBM Plex fonts (SIL OFL 1.1); their license texts are written to `site/THIRD-PARTY-LICENSES.txt` by the build.
