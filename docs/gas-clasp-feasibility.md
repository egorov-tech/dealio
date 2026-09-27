# Проверка clasp для ERP Apps Script (dealio)

Промпт для Claude Code: скопировать блок **«Промпт»** ниже целиком или сослаться на этот файл.

Цель — понять, **будет ли clasp работать** в нашей схеме, без прод-деплоя и без записи в живую таблицу.

---

## Промпт

```markdown
# Задача: проверить, подходит ли clasp для ERP Apps Script в dealio

## Контекст

Репозиторий: https://github.com/ArtemEgorov007/dealio
Локальный путь: ~/dealio

ERP «Выдача бирок» для заказчика (Морфлот Технология). Фронт (Nuxt) ходит в Google Apps Script Web App.
Исходник GAS в репо: `scripts/erp-gas-webapp.js`

Таблицы:
- Ведомости (prod): `<SPREADSHEET_ID>`
- Доступ к сервису: `12TAfi2p6hMBG_MnP4LEROnZ6BaJp0bTFHd93jq06Qz8`

Сейчас деплой вручную: copy-paste в script.google.com → Deploy → Web app.
URL prod зашит в GitHub secret `NUXT_PUBLIC_CRM_GAS_URL` (в коде env: `NUXT_PUBLIC_ERP_GAS_URL`).

**Важно:** GAS бота FindTagMFT не трогать — это отдельный проект Apps Script.

Недавняя правка в `scripts/erp-gas-webapp.js`: проверка дубликата бирки
(`assertBadgeNotRecorded_`) для листов «Логисты» и «Сдача».

Документация по clasp в репо: `docs/gas-clasp-feasibility.md` (этот файл).

## Цель (только feasibility, не прод)

Понять, **будет ли clasp работать** в нашей схеме:
- можно ли связать локальный код с существующим GAS-проектом;
- `push` / `create-version` / `update-deployment` без смены prod URL;
- есть ли блокеры (права, API, структура проекта, bound vs standalone).

**Не делать без явного подтверждения пользователя:**
- `update-deployment` на prod deployment;
- любые POST-записи в prod-таблицу (`recordPacking`, `recordHandover`, `issueBadge` и т.д.);
- правки FindTagMFT;
- коммит / push в git.

## Что сделать по шагам

### 1. Разведка репо

- Прочитать `scripts/erp-gas-webapp.js`, `app/utils/erp-sheets.ts`, `app/pages/erp-setup.vue`, README (секция ERP).
- Зафиксировать: какие `action` есть у GAS, откуда фронт берёт URL.

### 2. Проверить окружение

```bash
node -v          # нужен >= 20
npm -v
which clasp || npm list -g @google/clasp
```

Если clasp нет: `npm install -g @google/clasp`

Проверить, включён ли Google Apps Script API:
https://script.google.com/home/usersettings

### 3. Авторизация clasp

```bash
clasp show-authorized-user
```

Если не залогинен — `clasp login` (интерактивно; сообщить пользователю, если нужен браузер).

### 4. Найти существующий ERP GAS-проект

- `clasp list-scripts` — найти проект вроде «ERP Ведомости» / похожее имя.
- Если не найден — спросить у пользователя Script ID или URL из `/erp-setup` / секрета GitHub.
- **Не угадывать Script ID.**

### 5. Локальный тестовый клон (отдельная папка, не ломая репо)

```bash
cd /tmp
rm -rf dealio-gas-feasibility
mkdir dealio-gas-feasibility && cd dealio-gas-feasibility
clasp clone-script "<SCRIPT_ID>"
```

Проверить:
- скачался ли `appsscript.json`;
- совпадает ли код с `scripts/erp-gas-webapp.js` (diff);
- standalone или bound к таблице.

### 6. Тест push в черновик (без деплоя)

- Скопировать актуальный `scripts/erp-gas-webapp.js` → локальный файл проекта (`Code.js` или как после clone).
- `clasp show-file-status`
- `clasp push`
- `clasp open-script` — убедиться, что код в облаке обновился.

**Откат:** если push затёр что-то важное — `clasp pull` с версии до push или восстановить из `/tmp/dealio-gas-feasibility`.

### 7. Проверить deployments (read-only)

```bash
clasp list-deployments
clasp list-versions
```

Зафиксировать:
- deployment ID prod Web App;
- текущий URL `.../macros/s/.../exec`;
- совпадает ли URL с тем, что ожидает фронт.

Показать команду для безопасного обновления prod **без смены URL** (не выполнять на prod):

```bash
clasp create-version "feasibility test"
clasp update-deployment <DEPLOYMENT_ID> -V <VERSION> -d "описание"
```

### 8. Smoke GET (без записи в таблицу)

Если есть staging / test deployment URL — только GET:
- `?action=badges&workshop=kolpino`
- `?action=issuedToday&fio=...` (если есть тестовый FIO)

Если только prod URL — **только `badges` (read)**. POST с записью — нет.

### 9. Оценка staging-схемы

Описать, как завести:
- второй GAS-проект (staging `scriptId`);
- копию таблицы «Ведомости»;
- `SPREADSHEET_ID` через Script Properties;
- тест через `/erp-setup` (localStorage URL).

Если пользователь даст добро — создать **только** staging-проект, без prod.

## Формат ответа

### Вердикт

`РАБОТАЕТ` / `РАБОТАЕТ С ОГРАНИЧЕНИЯМИ` / `НЕ РАБОТАЕТ`

### Что проверено

Таблица: шаг → результат → команда / артефакт.

### Блокеры (если есть)

- нет доступа к Script ID;
- Apps Script API выключен;
- bound script / нет прав;
- clasp 3.x несовместимость;
- push ломает структуру;
- prod URL нельзя обновить без смены deployment ID;
- другое.

### Рекомендуемая структура в репо (если ок)

```
gas/
  Code.js
  appsscript.json
  .claspignore
  prod.clasp.json
  staging.clasp.json
docs/gas-deploy.md
```

### Безопасный workflow после внедрения

1. Правка в git (`scripts/` или `gas/`).
2. `clasp push` на staging.
3. Smoke GET + тестовые POST на копии таблицы.
4. `clasp push` на prod (черновик).
5. `clasp create-version "описание"`.
6. `clasp update-deployment <DEPLOYMENT_ID>` — URL не меняется.

### Что нужно от пользователя

- Script ID prod GAS (если не нашёл);
- подтверждение на staging-проект;
- подтверждение на prod `update-deployment`.

## Ограничения

- GitHub secrets не менять.
- Prod-таблицу не писать.
- FindTagMFT не трогать.
- Минимальный diff; это feasibility, не полная миграция.
```

---

## Справка (для человека)

### Три слоя Apps Script

| Слой | Команда | Что делает |
|------|---------|------------|
| Код (черновик) | `clasp push` | Заливает файлы в script.google.com |
| Версия | `clasp create-version` | Неизменяемый снимок |
| Deployment | `clasp update-deployment` | Обновляет Web App **без смены URL** |

`push` alone **не** обновляет то, что видят пользователи ERP — нужен ещё version + update-deployment.

### Полезные ссылки

- [clasp — Google Developers](https://developers.google.com/apps-script/guides/clasp)
- [Включить Apps Script API](https://script.google.com/home/usersettings)
- Таблица Ведомости: https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit

### Результат прогона

После выполнения промпта заполнить:

| Поле | Значение |
|------|----------|
| Дата | 2026-07-06 |
| Вердикт | РАБОТАЕТ |
| Script ID prod | `1FlUoP7h75RR_uUMoLSIJMhOfAAC0SZ1YnFtc85-SAaqawuBtS6h77x67` (standalone, найден через `clasp list-scripts`, не bound к таблице) |
| Deployment ID prod | `AKfycbw-vs4o6dJIFHi9a6bRysDbDYODmvlZugYDK3vY8t2KKS_5qFemXkGpDD-DBHI6vFMF` (@21). Есть также test-deployment `AKfycbzqI5oemSzEbtT63fBHr5lI7leYqv0-PXIrQYXV5Ew` (@HEAD) |
| Блокеры | Разовые, оба сняты в ходе прогона: (1) `npm install -g @google/clasp` упал с `EACCES` — обход через `npx --yes @google/clasp`; (2) Apps Script API не был включён на аккаунте `vdovykinmaksim@gmail.com` — включён вручную на `script.google.com/home/usersettings`, пропагация заняла ~5 минут |
| Следующий шаг | Решить с пользователем: (а) переносить ли `scripts/erp-gas-webapp.js` в структуру `gas/` с `.clasp.json`, (б) заводить ли staging-копию таблицы + второй GAS-проект, (в) когда делать `create-version` + `update-deployment` на прод (сейчас прод всё ещё на v21, без фикса `assertBadgeNotRecorded_` — черновик/HEAD уже содержит фикс после тестового push) |
