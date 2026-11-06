# Laminate → Composite

Лаборатория прочности стала первым модулем учебного портала **Composite · механика композитов и конструкций**.

- Каталог тем: https://avazar.github.io/composite/
- Прочность слоистых композитов: https://avazar.github.io/composite/strength/
- Разработка и документация: https://github.com/avazar/composite

Этот репозиторий сохраняет старый адрес **https://avazar.github.io/laminate/**. Страница автоматически переводит посетителя непосредственно в раздел прочности, сохраняя строку параметров и фрагмент адреса. Например:

```text
https://avazar.github.io/laminate/?lang=en#laminate
→ https://avazar.github.io/composite/strength/?lang=en#laminate
```

Старые ссылки и QR-коды продолжают работать. Используется `location.replace`, поэтому кнопка «Назад» не возвращает на промежуточную страницу. Без JavaScript доступны обычные ссылки на новую страницу.

## Проверка и публикация

Нужен Node.js 24 или новее. Для страницы перехода установка зависимостей не требуется.

```bash
npm test
npm run build
```

Сборка создаёт `site-redirect/`. Изменения ветки `dev` запускают тесты и публикацию этой папки в GitHub Pages.

Прежние исходники лаборатории сохранены в `src/`, а их история перенесена в `composite`. Для локальной сборки прежней версии можно выполнить `npm ci` и `npm run build:legacy`; результат будет в `site/`. Новые учебные модули и изменения лаборатории разрабатываются в репозитории `composite`.

## English

The strength lab is now part of [Composite](https://avazar.github.io/composite/?lang=en). This repository keeps the old `/laminate/` URL working by redirecting to [/composite/strength/](https://avazar.github.io/composite/strength/?lang=en), preserving all query parameters and the selected tab (`#criteria` or `#laminate`). Development continues in [avazar/composite](https://github.com/avazar/composite).

## Лицензия / License

MIT, см. [LICENSE](LICENSE).
