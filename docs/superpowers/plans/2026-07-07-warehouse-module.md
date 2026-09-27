# Модуль «Склад» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить заглушку `/warehouse` в ERP на рабочий модуль Приём/Выдача/Баланс товара, поверх отдельной Google-таблицы «Склад» и нового standalone GAS-бэкенда.

**Architecture:** Фронт — 7 новых/изменённых Vue-страниц в существующем Nuxt ERP-приложении (`~/dealio`), плоские роуты по образцу `scan-measurement → measurement`. Бэкенд — новый standalone Apps Script проект (`scripts/warehouse-gas-webapp.js`), читает/пишет три листа таблицы «Склад» (Номенклатура/Склад/Лог), общается с фронтом через `NUXT_PUBLIC_WAREHOUSE_GAS_URL`.

**Tech Stack:** Nuxt 4 (SPA, `ssr: false`), Vue 3 `<script setup>`, Pinia, Google Apps Script (V8), clasp CLI.

## Global Constraints

- ID во всех записях «Лог»/«Склад» — 5 частей: `Площадка|Ячейка|Наименование|Тип|Категория` (категория ищется на сервере по «Номенклатура», не приходит с фронта для Приёма, и **пересчитывается заново** на сервере из финальных type/unit для Выдачи — см. Task 1).
- Единица измерения — фиксированный список `шт.`, `пар`, `кг`, `м`, `компл.` (см. `types/warehouse.types.ts`), никакого свободного текста.
- Тип — `Новый` / `Б/у` (toggle, не чекбокс).
- `access.warehouse` (уже существует в `ErpAccessFlags`) — единственный флаг доступа для всего модуля; новых флагов не создавать.
- Все новые Vue-файлы — `<script setup lang="ts">` + `<style scoped lang="sass">`, повторяя существующий стиль кодовой базы (см. `measurement.vue`, `badges.vue` как образец).
- Нет юнит-тестов и юнит-тест-раннера в этом проекте (`package.json` содержит только `build`/`dev`) — «тест» каждой задачи ниже означает `npm run build` без ошибок + ручная/Playwright-проверка на staging, как это делалось для ERP Ведомости в этой же сессии.
- Ничего не пушить в `origin/main` и не деплоить GAS в прод без отдельного явного подтверждения пользователя (см. Tasks 15–17) — так было условлено в этой сессии для всех прод-изменений dealio.

---

## Файловая структура (итог)

**Создать:**
- `scripts/warehouse-gas-webapp.js` — GAS backend
- `types/warehouse.types.ts` — типы и константы (WAREHOUSE_UNITS, WAREHOUSE_TYPES, WarehouseStockItem)
- `app/utils/warehouse-sheets.ts` — HTTP-клиент к GAS
- `app/components/warehouse/WarehouseCategoryGrid.vue` — сетка плиток категорий (общая для Приёма/Выдачи)
- `app/pages/warehouse-receive.vue` — Приём: категория + список
- `app/pages/warehouse-receive-form.vue` — Приём: форма ввода
- `app/pages/warehouse-issue.vue` — Выдача: категория + список остатков
- `app/pages/warehouse-issue-form.vue` — Выдача: форма ввода
- `app/pages/warehouse-balance.vue` — Баланс: таблица

**Изменить:**
- `app/pages/warehouse.vue` — заглушка → хаб с 3 кнопками
- `store/erp-session.store.ts` — + транзитное состояние выбора товара/строки остатка
- `app/middleware/erp-flow.global.ts` — + новые роуты в `ERP_ROUTES`/`ACCESS_GUARDED` + 2 form-guard'а
- `app/components/erp/ErpTabBar.vue` — `isWarehouseSection` → префиксное совпадение
- `app/pages/register.vue` — подпись плитки «Склад»: «В разработке» → «Приём/выдача»
- `nuxt.config.ts` — + `warehouseGasUrl` в runtimeConfig.public
- `.github/workflows/nuxtjs.yml` — + секрет `NUXT_PUBLIC_WAREHOUSE_GAS_URL`

---

### Task 1: GAS backend — `scripts/warehouse-gas-webapp.js`

**Files:**
- Create: `scripts/warehouse-gas-webapp.js`

**Interfaces:**
- Produces (используется фронтом в Task 3): HTTP JSON API —
  - `GET ?action=categories` → `{ok, categories: string[]}`
  - `GET ?action=items&category=X` → `{ok, items: string[]}`
  - `GET ?action=stock&platform=Y&category=X?` → `{ok, items: {cell,name,type,category,balance,unit}[]}`
  - `POST {action:'receiveItem', platform,cell,name,type,qty,unit,fio}` → `{ok}` | `{ok:false, error}`
  - `POST {action:'issueItem', platform,cell,name,type,qty,unit,fio,recipientFio}` → `{ok}` | `{ok:false, error}`

- [ ] **Step 1: Написать файл**

```js
/**
 * Склад — Web App для приёма/выдачи товара.
 * Отдельный GAS-проект от ERP Ведомости — своя таблица, свой деплой.
 *
 * GET  ?action=categories
 * GET  ?action=items&category=...
 * GET  ?action=stock&platform=...&category=...   (category опционален)
 * POST { action: 'receiveItem', platform, cell, name, type, qty, unit, fio }
 * POST { action: 'issueItem',   platform, cell, name, type, qty, unit, fio, recipientFio }
 */
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
    || '<WAREHOUSE_SPREADSHEET_ID>'

const NOMENCLATURE_SHEET = 'Номенклатура'
const STOCK_SHEET = 'Склад'
const LOG_SHEET = 'Лог'

function doGet(e) {
    try {
        const action = e.parameter.action

        if (action === 'categories') {
            return jsonResponse_({ok: true, categories: getCategories_()})
        }

        if (action === 'items') {
            return jsonResponse_({ok: true, items: getItemsByCategory_(e.parameter.category || '')})
        }

        if (action === 'stock') {
            return jsonResponse_({ok: true, items: getStock_(e.parameter.platform || '', e.parameter.category || '')})
        }

        return jsonResponse_({ok: false, error: 'Unknown action'})
    } catch (error) {
        return jsonResponse_({ok: false, error: String(error.message || error)})
    }
}

function doPost(e) {
    try {
        const payload = JSON.parse(e.postData.contents)

        if (payload.action === 'receiveItem') {
            receiveItem_(payload)
            return jsonResponse_({ok: true})
        }

        if (payload.action === 'issueItem') {
            issueItem_(payload)
            return jsonResponse_({ok: true})
        }

        return jsonResponse_({ok: false, error: 'Unknown action'})
    } catch (error) {
        return jsonResponse_({ok: false, error: String(error.message || error)})
    }
}

function getSpreadsheet_() {
    return SpreadsheetApp.openById(SPREADSHEET_ID)
}

function getSheet_(name) {
    const sheet = getSpreadsheet_().getSheetByName(name)
    if (!sheet) throw new Error('Sheet not found: ' + name)
    return sheet
}

// Номенклатура: A Наименование товара | B Категория
function getCategories_() {
    const sheet = getSheet_(NOMENCLATURE_SHEET)
    const values = sheet.getDataRange().getValues()
    const categories = []
    const seen = {}
    for (let i = 1; i < values.length; i += 1) {
        const category = normalizeCell_(values[i][1])
        if (category && !seen[category]) {
            seen[category] = true
            categories.push(category)
        }
    }
    return categories
}

function getItemsByCategory_(category) {
    const sheet = getSheet_(NOMENCLATURE_SHEET)
    const values = sheet.getDataRange().getValues()
    const items = []
    for (let i = 1; i < values.length; i += 1) {
        const name = normalizeCell_(values[i][0])
        const rowCategory = normalizeCell_(values[i][1])
        if (name && rowCategory === category) items.push(name)
    }
    return items
}

function findCategoryForItem_(name) {
    const sheet = getSheet_(NOMENCLATURE_SHEET)
    const values = sheet.getDataRange().getValues()
    const normalizedName = normalizeCell_(name)
    for (let i = 1; i < values.length; i += 1) {
        if (normalizeCell_(values[i][0]) === normalizedName) {
            return normalizeCell_(values[i][1])
        }
    }
    throw new Error('Товар не найден в номенклатуре: ' + name)
}

// Склад: A ID | B Площадка | C Ячейка | D Наименование | E Тип | F Категория
//        | G Поступление | H Выдача | I Остаток | J Ед.изм.
function getStock_(platform, category) {
    const sheet = getSheet_(STOCK_SHEET)
    const values = sheet.getDataRange().getValues()
    const items = []
    for (let i = 1; i < values.length; i += 1) {
        const row = values[i]
        const rowPlatform = normalizeCell_(row[1])
        const rowCategory = normalizeCell_(row[5])
        const balance = Number(row[8]) || 0

        if (rowPlatform !== platform) continue
        if (category && rowCategory !== category) continue
        if (balance <= 0) continue

        items.push({
            cell: normalizeCell_(row[2]),
            name: normalizeCell_(row[3]),
            type: normalizeCell_(row[4]),
            category: rowCategory,
            balance: balance,
            unit: normalizeCell_(row[9]),
        })
    }
    return items
}

function buildId_(platform, cell, name, type, category) {
    return [platform, cell, name, type, category].join('|')
}

function findStockRow_(sheet, id) {
    const values = sheet.getDataRange().getValues()
    for (let i = 1; i < values.length; i += 1) {
        if (normalizeCell_(values[i][0]) === id) return i + 1 // 1-based номер строки
    }
    return -1
}

/**
 * «Склад» — статичный набор строк (СУММЕСЛИМН по ID, без скрипта, который бы
 * их добавлял). Если ID ещё нет — вставляем новую строку и копируем формулы
 * Поступление/Выдача/Остаток из соседней строки (copyTo сам сдвигает
 * относительные ссылки на новую строку, как обычный drag-fill в Sheets).
 */
function ensureStockRow_(platform, cell, name, type, category, unit) {
    const sheet = getSheet_(STOCK_SHEET)
    const id = buildId_(platform, cell, name, type, category)
    if (findStockRow_(sheet, id) > 0) return

    const lastRow = sheet.getLastRow()
    const newRow = lastRow + 1
    sheet.getRange(newRow, 1, 1, 6).setValues([[id, platform, cell, name, type, category]])
    sheet.getRange(newRow, 10).setValue(unit)

    if (lastRow >= 2) {
        sheet.getRange(lastRow, 7, 1, 3).copyTo(sheet.getRange(newRow, 7, 1, 3))
    }
}

function receiveItem_(payload) {
    const platform = String(payload.platform || '')
    const cell = String(payload.cell || '').trim()
    const name = String(payload.name || '').trim()
    const type = String(payload.type || '')
    const qty = Number(payload.qty)
    const unit = String(payload.unit || '')
    const fio = String(payload.fio || '')

    if (!platform || !cell || !name || !type || !qty || qty <= 0 || !unit) {
        throw new Error('Заполните все поля')
    }

    const category = findCategoryForItem_(name)

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) throw new Error('busy')

    try {
        ensureStockRow_(platform, cell, name, type, category, unit)
        appendLogRow_({
            platform: platform, action: 'Прием', cell: cell, name: name, type: type,
            qty: qty, unit: unit, receivedBy: fio, issuedBy: '', recipientFio: '',
            id: buildId_(platform, cell, name, type, category),
        })
    } finally {
        lock.releaseLock()
    }
}

/**
 * type/unit — редактируемые поля формы Выдачи (сотрудник может выдать не тем
 * типом/ед.изм., что были в исходно выбранной строке остатка). ID и проверка
 * остатка пересчитываются заново из ФИНАЛЬНЫХ значений формы, а не из
 * исходно выбранной строки — иначе можно списать не ту позицию склада.
 * Если для получившегося ID строки в «Склад» нет — остаток считается 0
 * (естественно приводит к ошибке «Недостаточно остатка», без отдельной
 * ветки «позиция не найдена»).
 */
function issueItem_(payload) {
    const platform = String(payload.platform || '')
    const cell = String(payload.cell || '').trim()
    const name = String(payload.name || '').trim()
    const type = String(payload.type || '')
    const qty = Number(payload.qty)
    const unit = String(payload.unit || '')
    const fio = String(payload.fio || '')
    const recipientFio = String(payload.recipientFio || '').trim()

    if (!platform || !cell || !name || !type || !qty || qty <= 0 || !unit || !recipientFio) {
        throw new Error('Заполните все поля')
    }

    const category = findCategoryForItem_(name)
    const id = buildId_(platform, cell, name, type, category)

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) throw new Error('busy')

    try {
        const sheet = getSheet_(STOCK_SHEET)
        const rowNumber = findStockRow_(sheet, id)
        const balance = rowNumber > 0 ? (Number(sheet.getRange(rowNumber, 9).getValue()) || 0) : 0

        if (qty > balance) throw new Error('Недостаточно остатка: доступно ' + balance)

        appendLogRow_({
            platform: platform, action: 'Выдача', cell: cell, name: name, type: type,
            qty: qty, unit: unit, receivedBy: '', issuedBy: fio, recipientFio: recipientFio,
            id: id,
        })
    } finally {
        lock.releaseLock()
    }
}

// Лог: A Дата|B Площадка|C Действие|D Ячейка|E Наименование|F Тип|G Категория
//      |H Кол-во|I Ед.изм.|J Принял|K Выдал|L Получил|M ID
function appendLogRow_(entry) {
    const sheet = getSheet_(LOG_SHEET)
    sheet.appendRow([
        new Date(),
        entry.platform,
        entry.action,
        entry.cell,
        entry.name,
        entry.type,
        '', // Категория — намеренно не заполняем (см. ТЗ)
        entry.qty,
        entry.unit,
        entry.receivedBy,
        entry.issuedBy,
        entry.recipientFio,
        entry.id,
    ])
}

function normalizeCell_(value) {
    return String(value == null ? '' : value).trim()
}

function jsonResponse_(payload) {
    return ContentService
        .createTextOutput(JSON.stringify(payload))
        .setMimeType(ContentService.MimeType.JSON)
}
```

- [ ] **Step 2: Проверить синтаксис локально**

Run: `node --check scripts/warehouse-gas-webapp.js`
Expected: без вывода (exit code 0) — GAS-синтаксис (V8) совместим с обычным JS, `node --check` ловит опечатки до заливки в облако.

- [ ] **Step 3: Коммит**

```bash
cd ~/dealio
git add scripts/warehouse-gas-webapp.js
git commit -m "feat(warehouse): GAS backend для приёма/выдачи/остатков склада"
```

---

### Task 2: Типы — `types/warehouse.types.ts`

**Files:**
- Create: `types/warehouse.types.ts`

**Interfaces:**
- Produces (используется в Tasks 3, 9–13): `WarehouseStockItem`, `WAREHOUSE_UNITS`, `WAREHOUSE_TYPES`, `WarehouseUnit`, `WarehouseItemType`

- [ ] **Step 1: Написать файл**

```ts
export const WAREHOUSE_UNITS = ['шт.', 'пар', 'кг', 'м', 'компл.'] as const
export type WarehouseUnit = typeof WAREHOUSE_UNITS[number]

export const WAREHOUSE_TYPES = ['Новый', 'Б/у'] as const
export type WarehouseItemType = typeof WAREHOUSE_TYPES[number]

export interface WarehouseStockItem {
    cell: string
    name: string
    type: string
    category: string
    balance: number
    unit: string
}
```

- [ ] **Step 2: Коммит**

```bash
cd ~/dealio
git add types/warehouse.types.ts
git commit -m "feat(warehouse): типы WarehouseStockItem, списки ед.изм./типа"
```

---

### Task 3: API-клиент — `app/utils/warehouse-sheets.ts`

**Files:**
- Create: `app/utils/warehouse-sheets.ts`

**Interfaces:**
- Consumes: `WarehouseStockItem` из `types/warehouse.types.ts` (Task 2); `useRuntimeConfig().public.warehouseGasUrl` (Task 5)
- Produces (используется в Tasks 9–13): `fetchWarehouseCategories(): Promise<string[]>`, `fetchWarehouseItems(category: string): Promise<string[]>`, `fetchWarehouseStock(platform: string, category?: string): Promise<WarehouseStockItem[]>`, `receiveWarehouseItem(payload: ReceiveItemPayload): Promise<void>`, `issueWarehouseItem(payload: IssueItemPayload): Promise<void>`

- [ ] **Step 1: Написать файл**

```ts
import type {WarehouseStockItem} from '~~/types/warehouse.types'

interface WarehouseConfig {
    gasUrl: string
}

function getConfig(): WarehouseConfig {
    const config = useRuntimeConfig()
    return {gasUrl: config.public.warehouseGasUrl || ''}
}

interface WarehouseGasResponse {
    ok?: boolean
    error?: string
    categories?: string[]
    items?: string[] | WarehouseStockItem[]
}

function buildUrl(gasUrl: string, params: Record<string, string>): string {
    const url = new URL(gasUrl)
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
    }
    return url.toString()
}

async function requestGet(params: Record<string, string>): Promise<WarehouseGasResponse> {
    const config = getConfig()
    if (!config.gasUrl) throw new Error('Склад не подключён')

    let response: Response
    try {
        response = await fetch(buildUrl(config.gasUrl, params))
    } catch {
        throw new Error('Нет связи с сервером. Проверьте интернет и повторите.')
    }

    if (!response.ok) throw new Error('Ошибка связи со складом')

    try {
        return await response.json() as WarehouseGasResponse
    } catch {
        throw new Error('Неверный ответ от сервера.')
    }
}

async function requestPost(payload: Record<string, string | number>): Promise<WarehouseGasResponse> {
    const config = getConfig()
    if (!config.gasUrl) throw new Error('Склад не подключён')

    let response: Response
    try {
        response = await fetch(config.gasUrl, {
            method: 'POST',
            headers: {'Content-Type': 'text/plain;charset=utf-8'},
            body: JSON.stringify(payload),
            redirect: 'follow',
        })
    } catch {
        throw new Error('Нет связи с сервером. Проверьте интернет и повторите.')
    }

    if (!response.ok) throw new Error('Ошибка связи со складом')

    try {
        return await response.json() as WarehouseGasResponse
    } catch {
        throw new Error('Неверный ответ от сервера. Обновите страницу и попробуйте снова.')
    }
}

export async function fetchWarehouseCategories(): Promise<string[]> {
    const result = await requestGet({action: 'categories'})
    if (!result.ok) throw new Error(result.error || 'Не удалось загрузить категории')
    return (result.categories as string[]) ?? []
}

export async function fetchWarehouseItems(category: string): Promise<string[]> {
    const result = await requestGet({action: 'items', category})
    if (!result.ok) throw new Error(result.error || 'Не удалось загрузить список товаров')
    return (result.items as string[]) ?? []
}

export async function fetchWarehouseStock(platform: string, category?: string): Promise<WarehouseStockItem[]> {
    const params: Record<string, string> = {action: 'stock', platform}
    if (category) params.category = category
    const result = await requestGet(params)
    if (!result.ok) throw new Error(result.error || 'Не удалось загрузить остатки')
    return (result.items as WarehouseStockItem[]) ?? []
}

export interface ReceiveItemPayload {
    platform: string
    cell: string
    name: string
    type: string
    qty: number
    unit: string
    fio: string
}

export async function receiveWarehouseItem(payload: ReceiveItemPayload): Promise<void> {
    const result = await requestPost({action: 'receiveItem', ...payload})
    if (!result.ok) throw new Error(result.error || 'Не удалось оформить приём')
}

export interface IssueItemPayload {
    platform: string
    cell: string
    name: string
    type: string
    qty: number
    unit: string
    fio: string
    recipientFio: string
}

export async function issueWarehouseItem(payload: IssueItemPayload): Promise<void> {
    const result = await requestPost({action: 'issueItem', ...payload})
    if (!result.ok) throw new Error(result.error || 'Не удалось оформить выдачу')
}
```

- [ ] **Step 2: Коммит**

```bash
cd ~/dealio
git add app/utils/warehouse-sheets.ts
git commit -m "feat(warehouse): HTTP-клиент к warehouse-gas-webapp"
```

---

### Task 4: Транзитное состояние — расширить `store/erp-session.store.ts`

**Files:**
- Modify: `store/erp-session.store.ts`

**Interfaces:**
- Consumes: `WarehouseStockItem` из `types/warehouse.types.ts` (Task 2)
- Produces (используется в Tasks 9–12): `sessionStore.warehouseReceiveItem: string | null`, `sessionStore.hasWarehouseReceiveItem: boolean`, `sessionStore.setWarehouseReceiveItem(name)`, `sessionStore.clearWarehouseReceiveItem()`, `sessionStore.warehouseIssueItem: WarehouseStockItem | null`, `sessionStore.hasWarehouseIssueItem: boolean`, `sessionStore.setWarehouseIssueItem(item)`, `sessionStore.clearWarehouseIssueItem()`

- [ ] **Step 1: Прочитать текущий файл**

Run: открыть `store/erp-session.store.ts` — текущее содержимое (41 строка) уже содержит `selectedBadge`/`measurementBadge` с той же схемой state/getters/actions, которую расширяем ниже.

- [ ] **Step 2: Добавить import типа наверху файла**

Сразу после `import {defineStore} from 'pinia'` добавить:

```ts
import type {WarehouseStockItem} from '~~/types/warehouse.types'
```

- [ ] **Step 3: Добавить поля в `state()`**

В объект, который сейчас возвращает `state: () => ({...})`, добавить (после `measurementBadge: '' as string,`):

```ts
        warehouseReceiveItem: null as string | null,
        warehouseIssueItem: null as WarehouseStockItem | null,
```

- [ ] **Step 4: Добавить геттеры**

В блок `getters: {...}`, после `hasMeasurementBadge`, добавить:

```ts
        hasWarehouseReceiveItem: (state): boolean => state.warehouseReceiveItem !== null,
        hasWarehouseIssueItem: (state): boolean => state.warehouseIssueItem !== null,
```

- [ ] **Step 5: Добавить actions**

В блок `actions: {...}`, после `clearMeasurementBadge`, добавить:

```ts
        setWarehouseReceiveItem(name: string) {
            this.warehouseReceiveItem = name
        },

        clearWarehouseReceiveItem() {
            this.warehouseReceiveItem = null
        },

        setWarehouseIssueItem(item: WarehouseStockItem) {
            this.warehouseIssueItem = item
        },

        clearWarehouseIssueItem() {
            this.warehouseIssueItem = null
        },
```

- [ ] **Step 6: Проверить сборку**

Run: `cd ~/dealio && npm run build`
Expected: `✔ built in ...` без TS-ошибок (проверит, что типы `WarehouseStockItem` и структура store согласованы).

- [ ] **Step 7: Коммит**

```bash
cd ~/dealio
git add store/erp-session.store.ts
git commit -m "feat(warehouse): транзитное состояние выбора товара/строки остатка"
```

---

### Task 5: Runtime config + env var

**Files:**
- Modify: `nuxt.config.ts`
- Modify: `.github/workflows/nuxtjs.yml`

**Interfaces:**
- Produces (используется в Task 3): `useRuntimeConfig().public.warehouseGasUrl`

- [ ] **Step 1: Добавить `warehouseGasUrl` в `nuxt.config.ts`**

В `runtimeConfig.public`, после строки `erpGasUrl: process.env.NUXT_PUBLIC_ERP_GAS_URL || '',`, добавить:

```ts
            warehouseGasUrl: process.env.NUXT_PUBLIC_WAREHOUSE_GAS_URL || '',
```

- [ ] **Step 2: Добавить секрет в workflow**

В `.github/workflows/nuxtjs.yml`, в шаге `Generate static site`, после строки `NUXT_PUBLIC_ERP_GAS_URL: ${{ secrets.NUXT_PUBLIC_CRM_GAS_URL }}`, добавить:

```yaml
          NUXT_PUBLIC_WAREHOUSE_GAS_URL: ${{ secrets.NUXT_PUBLIC_WAREHOUSE_GAS_URL }}
```

- [ ] **Step 3: Проверить сборку локально с фейковым значением**

Run: `cd ~/dealio && NUXT_PUBLIC_WAREHOUSE_GAS_URL="https://example.com/fake" npm run build`
Expected: `✔ built in ...` без ошибок.

- [ ] **Step 4: Коммит**

```bash
cd ~/dealio
git add nuxt.config.ts .github/workflows/nuxtjs.yml
git commit -m "feat(warehouse): env-переменная NUXT_PUBLIC_WAREHOUSE_GAS_URL"
```

**Примечание для пользователя (не автоматизируется):** сам секрет `NUXT_PUBLIC_WAREHOUSE_GAS_URL` в GitHub (Settings → Secrets and variables → Actions) нужно завести вручную со значением прод-URL из Task 15 — без этого прод-сборка получит пустую строку и модуль будет писать «Склад не подключён».

---

### Task 6: Middleware — `app/middleware/erp-flow.global.ts`

**Files:**
- Modify: `app/middleware/erp-flow.global.ts`

**Interfaces:**
- Consumes: `sessionStore.hasWarehouseReceiveItem`, `sessionStore.hasWarehouseIssueItem` (Task 4)

- [ ] **Step 1: Добавить новые пути в `ERP_ROUTES`**

В `const ERP_ROUTES = new Set([...])`, после `'/warehouse',`, добавить:

```ts
    '/warehouse-receive',
    '/warehouse-receive-form',
    '/warehouse-issue',
    '/warehouse-issue-form',
    '/warehouse-balance',
```

- [ ] **Step 2: Добавить те же пути в `ACCESS_GUARDED`**

В `const ACCESS_GUARDED: Record<...> = {...}`, после `'/warehouse': 'warehouse',`, добавить:

```ts
        '/warehouse-receive': 'warehouse',
        '/warehouse-receive-form': 'warehouse',
        '/warehouse-issue': 'warehouse',
        '/warehouse-issue-form': 'warehouse',
        '/warehouse-balance': 'warehouse',
```

- [ ] **Step 3: Добавить form-guard'ы**

В самом конце функции, после блока `if (path === '/receipt' && !sessionStore.hasSelectedBadge) { return navigateTo('/badges') }`, добавить:

```ts

    if (path === '/warehouse-receive-form' && !sessionStore.hasWarehouseReceiveItem) {
        return navigateTo('/warehouse-receive')
    }

    if (path === '/warehouse-issue-form' && !sessionStore.hasWarehouseIssueItem) {
        return navigateTo('/warehouse-issue')
    }
```

- [ ] **Step 4: Проверить сборку**

Run: `cd ~/dealio && npm run build`
Expected: `✔ built in ...` без ошибок.

- [ ] **Step 5: Коммит**

```bash
cd ~/dealio
git add app/middleware/erp-flow.global.ts
git commit -m "feat(warehouse): access-guard и form-guard для роутов склада"
```

---

### Task 7: Компонент — `app/components/warehouse/WarehouseCategoryGrid.vue`

**Files:**
- Create: `app/components/warehouse/WarehouseCategoryGrid.vue`

**Interfaces:**
- Produces (используется в Tasks 9, 11): props `categories: string[]`, `selected: string | null`; emit `select: [category: string]`

- [ ] **Step 1: Написать файл**

Иконка одна и та же для всех категорий (`heroicons:tag`) — категории приходят из таблицы как обычные строки без привязки к конкретной иконке, жёстко прибивать иконку к конкретному названию категории было бы хрупко (ломается при малейшем изменении названия в «Номенклатура»).

```vue
<script setup lang="ts">
defineProps<{
  categories: string[]
  selected: string | null
}>()

defineEmits<{
  select: [category: string]
}>()
</script>

<template>
  <div class="wh-cat-grid">
    <button
        v-for="category in categories"
        :key="category"
        type="button"
        class="wh-cat-tile"
        :class="{ 'wh-cat-tile--active': category === selected }"
        @click="$emit('select', category)"
    >
      <span class="wh-cat-tile__ic"><Icon name="heroicons:tag" size="16"/></span>
      <b>{{ category }}</b>
    </button>
  </div>
</template>

<style scoped lang="sass">
.wh-cat-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 8px

.wh-cat-tile
  display: flex
  flex-direction: column
  gap: 6px
  padding: 12px 10px
  border: 1px solid var(--color-border)
  border-radius: 13px
  background: var(--color-card-bg)
  box-shadow: var(--erp-shadow-card, 0 1px 0 rgba(0, 0, 0, 0.04))
  text-align: left
  cursor: pointer

  &--active
    outline: 2px solid var(--color-primary)
    outline-offset: -1px

.wh-cat-tile__ic
  display: flex
  align-items: center
  justify-content: center
  width: 28px
  height: 28px
  border-radius: 9px
  background: var(--color-primary-light)
  color: var(--color-primary)

.wh-cat-tile b
  font-size: 12.5px
  font-weight: 650
  line-height: 1.2
</style>
```

- [ ] **Step 2: Коммит**

```bash
cd ~/dealio
git add app/components/warehouse/WarehouseCategoryGrid.vue
git commit -m "feat(warehouse): общий компонент сетки категорий"
```

---

### Task 8: Хаб — переписать `app/pages/warehouse.vue`

**Files:**
- Modify: `app/pages/warehouse.vue` (сейчас 10 строк — `ErpScreen` + `ErpPlaceholder`, полностью заменяется)

**Interfaces:**
- Produces: роут `/warehouse` с переходами на `/warehouse-receive`, `/warehouse-issue`, `/warehouse-balance`

- [ ] **Step 1: Заменить содержимое файла**

```vue
<script setup lang="ts">
definePageMeta({layout: 'erp'})
useSeoMeta({title: 'Склад | ERP'})

const router = useRouter()
</script>

<template>
  <ErpScreen title="Склад" icon="heroicons:archive-box">
    <ErpGroupedList>
      <ErpListRow chevron @click="router.push('/warehouse-receive')">
        <template #leading>
          <span class="wh-hub-ic wh-hub-ic--receive">
            <Icon name="heroicons:arrow-down-tray" size="20"/>
          </span>
        </template>
        <span class="wh-hub-row">
          <span class="wh-hub-row__title">Приём</span>
          <span class="wh-hub-row__sub">Оприходовать товар на склад</span>
        </span>
      </ErpListRow>
      <ErpListRow chevron @click="router.push('/warehouse-issue')">
        <template #leading>
          <span class="wh-hub-ic wh-hub-ic--issue">
            <Icon name="heroicons:arrow-up-tray" size="20"/>
          </span>
        </template>
        <span class="wh-hub-row">
          <span class="wh-hub-row__title">Выдача</span>
          <span class="wh-hub-row__sub">Выдать товар со склада</span>
        </span>
      </ErpListRow>
      <ErpListRow chevron @click="router.push('/warehouse-balance')">
        <template #leading>
          <span class="wh-hub-ic wh-hub-ic--balance">
            <Icon name="heroicons:scale" size="20"/>
          </span>
        </template>
        <span class="wh-hub-row">
          <span class="wh-hub-row__title">Баланс</span>
          <span class="wh-hub-row__sub">Остатки по вашей площадке</span>
        </span>
      </ErpListRow>
    </ErpGroupedList>
  </ErpScreen>
</template>

<style scoped lang="sass">
.wh-hub-ic
  display: flex
  align-items: center
  justify-content: center
  width: 36px
  height: 36px
  border-radius: 11px

  &--receive
    color: #1E8A4C
    background-color: rgba(30, 138, 76, 0.12)

  &--issue
    color: #C97A0C
    background-color: rgba(230, 145, 15, 0.14)

  &--balance
    color: #7C5CE0
    background-color: rgba(120, 90, 220, 0.12)

.wh-hub-row
  display: flex
  flex-direction: column
  gap: 1px

.wh-hub-row__title
  font-size: 15.5px
  font-weight: 650

.wh-hub-row__sub
  font-size: 12.5px
  color: var(--color-text-secondary)
</style>
```

- [ ] **Step 2: Проверить сборку**

Run: `cd ~/dealio && npm run build`
Expected: `✔ built in ...` без ошибок.

- [ ] **Step 3: Коммит**

```bash
cd ~/dealio
git add app/pages/warehouse.vue
git commit -m "feat(warehouse): хаб-экран Приём/Выдача/Баланс"
```

---

### Task 9: Приём — список — `app/pages/warehouse-receive.vue`

**Files:**
- Create: `app/pages/warehouse-receive.vue`

**Interfaces:**
- Consumes: `fetchWarehouseCategories`, `fetchWarehouseItems` (Task 3); `WarehouseCategoryGrid` (Task 7); `sessionStore.setWarehouseReceiveItem` (Task 4)
- Produces: роут `/warehouse-receive` → переход на `/warehouse-receive-form`

- [ ] **Step 1: Написать файл**

```vue
<script setup lang="ts">
import {fetchWarehouseCategories, fetchWarehouseItems} from '~/utils/warehouse-sheets'
import {useErpSessionStore} from '~~/store/erp-session.store'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'Приём | ERP'})

const router = useRouter()
const sessionStore = useErpSessionStore()

const categories = ref<string[]>([])
const categoriesLoading = ref(true)
const categoriesError = ref('')

const selectedCategory = ref<string | null>(null)
const items = ref<string[]>([])
const itemsLoading = ref(false)
const itemsError = ref('')
const query = ref('')

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

const filteredItems = computed(() => {
    const needle = normalize(query.value)
    if (!needle) return items.value
    return items.value.filter(item => normalize(item).includes(needle))
})

const loadCategories = async () => {
    categoriesLoading.value = true
    categoriesError.value = ''
    try {
        categories.value = await fetchWarehouseCategories()
    } catch (error) {
        categoriesError.value = error instanceof Error ? error.message : 'Ошибка загрузки категорий'
    } finally {
        categoriesLoading.value = false
    }
}

const selectCategory = async (category: string) => {
    selectedCategory.value = category
    query.value = ''
    itemsLoading.value = true
    itemsError.value = ''
    try {
        items.value = await fetchWarehouseItems(category)
    } catch (error) {
        itemsError.value = error instanceof Error ? error.message : 'Ошибка загрузки товаров'
    } finally {
        itemsLoading.value = false
    }
}

const retryItems = () => {
    if (selectedCategory.value) selectCategory(selectedCategory.value)
}

const selectItem = (name: string) => {
    sessionStore.setWarehouseReceiveItem(name)
    router.push('/warehouse-receive-form')
}

onMounted(loadCategories)
</script>

<template>
  <ErpScreen title="Приём" icon="heroicons:arrow-down-tray">
    <ErpEmptyState v-if="categoriesLoading" loading>
      <span>Загрузка категорий…</span>
    </ErpEmptyState>

    <ErpEmptyState v-else-if="categoriesError" error>
      <p>{{ categoriesError }}</p>
      <UiButton variant="outline" @click="loadCategories">Повторить</UiButton>
    </ErpEmptyState>

    <template v-else>
      <ErpSectionLabel>Категория</ErpSectionLabel>
      <WarehouseCategoryGrid
          :categories="categories"
          :selected="selectedCategory"
          @select="selectCategory"
      />

      <template v-if="selectedCategory">
        <ErpSearchBar
            v-model="query"
            placeholder="Поиск по наименованию"
            :count-label="items.length ? `Найдено ${filteredItems.length} из ${items.length}` : ''"
        />

        <ErpEmptyState v-if="itemsLoading" loading>
          <span>Загрузка…</span>
        </ErpEmptyState>

        <ErpEmptyState v-else-if="itemsError" error>
          <p>{{ itemsError }}</p>
          <UiButton variant="outline" @click="retryItems">Повторить</UiButton>
        </ErpEmptyState>

        <ErpEmptyState v-else-if="items.length === 0">
          <p>Для категории «{{ selectedCategory }}» товары не найдены</p>
        </ErpEmptyState>

        <ErpEmptyState v-else-if="filteredItems.length === 0">
          <p>Ничего не найдено по запросу «{{ query }}»</p>
          <UiButton variant="outline" @click="query = ''">Очистить поиск</UiButton>
        </ErpEmptyState>

        <ErpGroupedList v-else>
          <ErpListRow
              v-for="item in filteredItems"
              :key="item"
              chevron
              @click="selectItem(item)"
          >
            {{ item }}
          </ErpListRow>
        </ErpGroupedList>
      </template>
    </template>
  </ErpScreen>
</template>
```

- [ ] **Step 2: Проверить сборку**

Run: `cd ~/dealio && npm run build`
Expected: `✔ built in ...` без ошибок.

- [ ] **Step 3: Коммит**

```bash
cd ~/dealio
git add app/pages/warehouse-receive.vue
git commit -m "feat(warehouse): экран Приёма — категории и список товаров"
```

---

### Task 10: Приём — форма — `app/pages/warehouse-receive-form.vue`

**Files:**
- Create: `app/pages/warehouse-receive-form.vue`

**Interfaces:**
- Consumes: `receiveWarehouseItem` (Task 3); `WAREHOUSE_UNITS`, `WAREHOUSE_TYPES` (Task 2); `sessionStore.warehouseReceiveItem/hasWarehouseReceiveItem/clearWarehouseReceiveItem` (Task 4); `employeeStore.platform/fio` (существующий `erp-employee.store.ts`)

- [ ] **Step 1: Написать файл**

```vue
<script setup lang="ts">
import {receiveWarehouseItem} from '~/utils/warehouse-sheets'
import {WAREHOUSE_UNITS, WAREHOUSE_TYPES} from '~~/types/warehouse.types'
import {useErpEmployeeStore} from '~~/store/erp-employee.store'
import {useErpSessionStore} from '~~/store/erp-session.store'
import {useAppToast} from '~/composables/useAppToast'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'Приём товара | ERP'})

const employeeStore = useErpEmployeeStore()
const sessionStore = useErpSessionStore()
const router = useRouter()
const {showSuccess, showError} = useAppToast()

const itemName = computed(() => sessionStore.warehouseReceiveItem ?? '')

const qty = ref('')
const unit = ref<typeof WAREHOUSE_UNITS[number] | null>(null)
const cell = ref('')
const type = ref<typeof WAREHOUSE_TYPES[number]>('Новый')
const isLoading = ref(false)

const qtyError = computed(() => {
    const trimmed = qty.value.trim()
    if (!trimmed) return ''
    return /^\d+$/.test(trimmed) ? '' : 'Только целые числа'
})

const canSubmit = computed(() =>
    !isLoading.value
    && qty.value.trim() !== ''
    && !qtyError.value
    && unit.value !== null
    && cell.value.trim() !== '',
)

const submit = async () => {
    if (!canSubmit.value) return

    isLoading.value = true

    try {
        await receiveWarehouseItem({
            platform: employeeStore.platform,
            cell: cell.value.trim(),
            name: itemName.value,
            type: type.value,
            qty: parseInt(qty.value, 10),
            unit: unit.value!,
            fio: employeeStore.fio,
        })
        showSuccess('Товар принят', itemName.value)
        sessionStore.clearWarehouseReceiveItem()
        router.push('/warehouse-receive')
    } catch (error) {
        showError(error, 'Не удалось оформить приём')
    } finally {
        isLoading.value = false
    }
}

const goBack = () => router.push('/warehouse-receive')

onMounted(() => {
    if (!sessionStore.hasWarehouseReceiveItem) {
        router.replace('/warehouse-receive')
    }
})
</script>

<template>
  <ErpScreen title="Приём товара" icon="heroicons:arrow-down-tray">
    <div class="wh-item-card">
      <span class="wh-item-card__label">Товар</span>
      <span class="wh-item-card__value">{{ itemName }}</span>
    </div>

    <div class="wh-section">
      <p class="wh-section__title">Единица измерения</p>
      <div class="wh-chip-row">
        <button
            v-for="opt in WAREHOUSE_UNITS"
            :key="opt"
            type="button"
            class="wh-chip"
            :class="{ 'wh-chip--active': unit === opt }"
            @click="unit = opt"
        >
          {{ opt }}
        </button>
      </div>
    </div>

    <div class="wh-section">
      <p class="wh-section__title">Тип</p>
      <div class="wh-toggle-row">
        <button
            v-for="opt in WAREHOUSE_TYPES"
            :key="opt"
            type="button"
            class="wh-toggle-opt"
            :class="{ 'wh-toggle-opt--active': type === opt }"
            @click="type = opt"
        >
          {{ opt }}
        </button>
      </div>
    </div>

    <UiInput
        id="receive-qty"
        v-model="qty"
        label="Количество"
        inputmode="numeric"
        :error="qtyError"
    />
    <UiInput
        id="receive-cell"
        v-model="cell"
        label="Ячейка хранения"
    />

    <template #footer>
      <UiButton
          block
          :loading="isLoading"
          :disabled="!canSubmit"
          @click="submit"
      >
        Принять
      </UiButton>
      <UiButton block variant="ghost" @click="goBack">
        Назад
      </UiButton>
    </template>
  </ErpScreen>
</template>

<style scoped lang="sass">
.wh-item-card
  display: flex
  align-items: center
  gap: var(--spacing-3)
  padding: 14px 16px
  border-radius: 13px
  background-color: var(--color-card-bg)
  box-shadow: var(--erp-shadow-card, 0 1px 0 rgba(0, 0, 0, 0.04))

.wh-item-card__label
  flex-shrink: 0
  font-size: 11px
  font-weight: 600
  text-transform: uppercase
  letter-spacing: 0.5px
  color: var(--color-text-secondary)

.wh-item-card__value
  flex: 1
  min-width: 0
  font-size: var(--font-size-base)
  font-weight: 500
  line-height: 1.4
  color: var(--color-text)

.wh-section
  display: flex
  flex-direction: column
  gap: var(--spacing-2)

.wh-section__title
  margin: 0 0 0 4px
  font-size: 13px
  font-weight: 500
  color: var(--color-text-secondary)
  text-transform: uppercase
  letter-spacing: 0.3px

.wh-chip-row
  display: flex
  gap: 6px
  flex-wrap: wrap

.wh-chip
  padding: 7px 13px
  border-radius: 999px
  font-size: 13px
  font-weight: 600
  background: var(--color-card-bg)
  border: 1px solid var(--color-border)
  color: var(--color-text-secondary)
  cursor: pointer

  &--active
    background: var(--color-primary)
    border-color: var(--color-primary)
    color: #fff

.wh-toggle-row
  display: flex
  gap: 2px
  background: rgba(118, 118, 128, 0.12)
  border-radius: 9px
  padding: 2px

.wh-toggle-opt
  flex: 1
  padding: 7px 8px
  border: none
  border-radius: 7px
  background: transparent
  color: var(--color-text)
  font-size: var(--font-size-sm)
  font-weight: 500
  cursor: pointer

  &--active
    background: #FFFFFF
    color: var(--color-text)
    font-weight: 600
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12), 0 0.5px 1px rgba(0, 0, 0, 0.06)
</style>
```

- [ ] **Step 2: Проверить сборку**

Run: `cd ~/dealio && npm run build`
Expected: `✔ built in ...` без ошибок.

- [ ] **Step 3: Коммит**

```bash
cd ~/dealio
git add app/pages/warehouse-receive-form.vue
git commit -m "feat(warehouse): форма приёма — кол-во/ед.изм./ячейка/тип"
```

---

### Task 11: Выдача — список — `app/pages/warehouse-issue.vue`

**Files:**
- Create: `app/pages/warehouse-issue.vue`

**Interfaces:**
- Consumes: `fetchWarehouseCategories`, `fetchWarehouseStock` (Task 3); `WarehouseCategoryGrid` (Task 7); `sessionStore.setWarehouseIssueItem` (Task 4); `employeeStore.platform`

- [ ] **Step 1: Написать файл**

```vue
<script setup lang="ts">
import {fetchWarehouseCategories, fetchWarehouseStock} from '~/utils/warehouse-sheets'
import type {WarehouseStockItem} from '~~/types/warehouse.types'
import {useErpEmployeeStore} from '~~/store/erp-employee.store'
import {useErpSessionStore} from '~~/store/erp-session.store'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'Выдача | ERP'})

const employeeStore = useErpEmployeeStore()
const sessionStore = useErpSessionStore()
const router = useRouter()

const categories = ref<string[]>([])
const categoriesLoading = ref(true)
const categoriesError = ref('')

const selectedCategory = ref<string | null>(null)
const stockItems = ref<WarehouseStockItem[]>([])
const itemsLoading = ref(false)
const itemsError = ref('')
const query = ref('')

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

const filteredItems = computed(() => {
    const needle = normalize(query.value)
    if (!needle) return stockItems.value
    return stockItems.value.filter(item => normalize(item.name).includes(needle))
})

const loadCategories = async () => {
    categoriesLoading.value = true
    categoriesError.value = ''
    try {
        categories.value = await fetchWarehouseCategories()
    } catch (error) {
        categoriesError.value = error instanceof Error ? error.message : 'Ошибка загрузки категорий'
    } finally {
        categoriesLoading.value = false
    }
}

const selectCategory = async (category: string) => {
    selectedCategory.value = category
    query.value = ''
    itemsLoading.value = true
    itemsError.value = ''
    try {
        stockItems.value = await fetchWarehouseStock(employeeStore.platform, category)
    } catch (error) {
        itemsError.value = error instanceof Error ? error.message : 'Ошибка загрузки остатков'
    } finally {
        itemsLoading.value = false
    }
}

const retryItems = () => {
    if (selectedCategory.value) selectCategory(selectedCategory.value)
}

const selectItem = (item: WarehouseStockItem) => {
    sessionStore.setWarehouseIssueItem(item)
    router.push('/warehouse-issue-form')
}

onMounted(loadCategories)
</script>

<template>
  <ErpScreen title="Выдача" icon="heroicons:arrow-up-tray">
    <ErpEmptyState v-if="categoriesLoading" loading>
      <span>Загрузка категорий…</span>
    </ErpEmptyState>

    <ErpEmptyState v-else-if="categoriesError" error>
      <p>{{ categoriesError }}</p>
      <UiButton variant="outline" @click="loadCategories">Повторить</UiButton>
    </ErpEmptyState>

    <template v-else>
      <ErpSectionLabel>Категория</ErpSectionLabel>
      <WarehouseCategoryGrid
          :categories="categories"
          :selected="selectedCategory"
          @select="selectCategory"
      />

      <template v-if="selectedCategory">
        <ErpSearchBar
            v-model="query"
            placeholder="Поиск по наименованию"
            :count-label="stockItems.length ? `Найдено ${filteredItems.length} из ${stockItems.length}` : ''"
        />

        <ErpEmptyState v-if="itemsLoading" loading>
          <span>Загрузка…</span>
        </ErpEmptyState>

        <ErpEmptyState v-else-if="itemsError" error>
          <p>{{ itemsError }}</p>
          <UiButton variant="outline" @click="retryItems">Повторить</UiButton>
        </ErpEmptyState>

        <ErpEmptyState v-else-if="stockItems.length === 0">
          <p>Для категории «{{ selectedCategory }}» остатков на вашей площадке нет</p>
        </ErpEmptyState>

        <ErpEmptyState v-else-if="filteredItems.length === 0">
          <p>Ничего не найдено по запросу «{{ query }}»</p>
          <UiButton variant="outline" @click="query = ''">Очистить поиск</UiButton>
        </ErpEmptyState>

        <ErpGroupedList v-else>
          <ErpListRow
              v-for="item in filteredItems"
              :key="`${item.cell}-${item.name}-${item.type}`"
              chevron
              multiline
              @click="selectItem(item)"
          >
            <span class="wh-issue-row">
              <span class="wh-issue-row__name">{{ item.name }}</span>
              <span class="wh-issue-row__meta">Ячейка {{ item.cell }} · {{ item.type }}</span>
            </span>
            <template #trailing>
              <span class="wh-stock-pill">{{ item.balance }} {{ item.unit }}</span>
            </template>
          </ErpListRow>
        </ErpGroupedList>
      </template>
    </template>
  </ErpScreen>
</template>

<style scoped lang="sass">
.wh-issue-row
  display: flex
  flex-direction: column
  gap: 2px
  min-width: 0

.wh-issue-row__name
  font-size: 15px
  font-weight: 600

.wh-issue-row__meta
  font-size: 12px
  color: var(--color-text-secondary)

.wh-stock-pill
  font-size: 12px
  font-weight: 700
  padding: 3px 9px
  border-radius: 999px
  background: rgba(30, 138, 76, 0.12)
  color: #1E8A4C
  flex-shrink: 0
  white-space: nowrap
</style>
```

- [ ] **Step 2: Проверить сборку**

Run: `cd ~/dealio && npm run build`
Expected: `✔ built in ...` без ошибок.

- [ ] **Step 3: Коммит**

```bash
cd ~/dealio
git add app/pages/warehouse-issue.vue
git commit -m "feat(warehouse): экран Выдачи — категории и список остатков"
```

---

### Task 12: Выдача — форма — `app/pages/warehouse-issue-form.vue`

**Files:**
- Create: `app/pages/warehouse-issue-form.vue`

**Interfaces:**
- Consumes: `issueWarehouseItem` (Task 3); `WAREHOUSE_UNITS`, `WAREHOUSE_TYPES` (Task 2); `sessionStore.warehouseIssueItem/hasWarehouseIssueItem/clearWarehouseIssueItem` (Task 4)

- [ ] **Step 1: Написать файл**

```vue
<script setup lang="ts">
import {issueWarehouseItem} from '~/utils/warehouse-sheets'
import {WAREHOUSE_UNITS, WAREHOUSE_TYPES} from '~~/types/warehouse.types'
import {useErpEmployeeStore} from '~~/store/erp-employee.store'
import {useErpSessionStore} from '~~/store/erp-session.store'
import {useAppToast} from '~/composables/useAppToast'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'Выдача товара | ERP'})

const employeeStore = useErpEmployeeStore()
const sessionStore = useErpSessionStore()
const router = useRouter()
const {showSuccess, showError} = useAppToast()

const item = computed(() => sessionStore.warehouseIssueItem)

const qty = ref('')
const unit = ref<typeof WAREHOUSE_UNITS[number] | null>(null)
const type = ref<typeof WAREHOUSE_TYPES[number] | null>(null)
const recipientFio = ref('')
const isLoading = ref(false)

const qtyError = computed(() => {
    const trimmed = qty.value.trim()
    if (!trimmed) return ''
    return /^\d+$/.test(trimmed) ? '' : 'Только целые числа'
})

const canSubmit = computed(() =>
    !isLoading.value
    && !!item.value
    && qty.value.trim() !== ''
    && !qtyError.value
    && unit.value !== null
    && type.value !== null
    && recipientFio.value.trim() !== '',
)

const submit = async () => {
    if (!canSubmit.value || !item.value) return

    isLoading.value = true

    try {
        await issueWarehouseItem({
            platform: employeeStore.platform,
            cell: item.value.cell,
            name: item.value.name,
            type: type.value!,
            qty: parseInt(qty.value, 10),
            unit: unit.value!,
            fio: employeeStore.fio,
            recipientFio: recipientFio.value.trim(),
        })
        showSuccess('Товар выдан', item.value.name)
        sessionStore.clearWarehouseIssueItem()
        router.push('/warehouse-issue')
    } catch (error) {
        showError(error, 'Не удалось оформить выдачу')
    } finally {
        isLoading.value = false
    }
}

const goBack = () => router.push('/warehouse-issue')

onMounted(() => {
    if (!sessionStore.hasWarehouseIssueItem || !item.value) {
        router.replace('/warehouse-issue')
        return
    }
    // Предзаполняем значениями выбранной строки остатка — поля остаются
    // редактируемыми (сотрудник может выдать другим типом/ед.изм., тогда
    // сервер спишет с другой позиции склада, см. warehouse-gas-webapp.js).
    unit.value = item.value.unit as typeof WAREHOUSE_UNITS[number]
    type.value = item.value.type as typeof WAREHOUSE_TYPES[number]
})
</script>

<template>
  <ErpScreen title="Выдача товара" icon="heroicons:arrow-up-tray">
    <div v-if="item" class="wh-item-card">
      <span class="wh-item-card__label">Товар</span>
      <span class="wh-item-card__value">{{ item.name }} · остаток {{ item.balance }} {{ item.unit }}</span>
    </div>

    <div class="wh-section">
      <p class="wh-section__title">Единица измерения</p>
      <div class="wh-chip-row">
        <button
            v-for="opt in WAREHOUSE_UNITS"
            :key="opt"
            type="button"
            class="wh-chip"
            :class="{ 'wh-chip--active': unit === opt }"
            @click="unit = opt"
        >
          {{ opt }}
        </button>
      </div>
    </div>

    <div class="wh-section">
      <p class="wh-section__title">Тип</p>
      <div class="wh-toggle-row">
        <button
            v-for="opt in WAREHOUSE_TYPES"
            :key="opt"
            type="button"
            class="wh-toggle-opt"
            :class="{ 'wh-toggle-opt--active': type === opt }"
            @click="type = opt"
        >
          {{ opt }}
        </button>
      </div>
    </div>

    <UiInput
        id="issue-qty"
        v-model="qty"
        label="Количество"
        inputmode="numeric"
        :error="qtyError"
    />
    <UiInput
        id="issue-recipient"
        v-model="recipientFio"
        label="ФИО получателя"
    />

    <template #footer>
      <UiButton
          block
          :loading="isLoading"
          :disabled="!canSubmit"
          @click="submit"
      >
        Выдать
      </UiButton>
      <UiButton block variant="ghost" @click="goBack">
        Назад
      </UiButton>
    </template>
  </ErpScreen>
</template>

<style scoped lang="sass">
.wh-item-card
  display: flex
  align-items: center
  gap: var(--spacing-3)
  padding: 14px 16px
  border-radius: 13px
  background-color: var(--color-card-bg)
  box-shadow: var(--erp-shadow-card, 0 1px 0 rgba(0, 0, 0, 0.04))

.wh-item-card__label
  flex-shrink: 0
  font-size: 11px
  font-weight: 600
  text-transform: uppercase
  letter-spacing: 0.5px
  color: var(--color-text-secondary)

.wh-item-card__value
  flex: 1
  min-width: 0
  font-size: var(--font-size-base)
  font-weight: 500
  line-height: 1.4
  color: var(--color-text)

.wh-section
  display: flex
  flex-direction: column
  gap: var(--spacing-2)

.wh-section__title
  margin: 0 0 0 4px
  font-size: 13px
  font-weight: 500
  color: var(--color-text-secondary)
  text-transform: uppercase
  letter-spacing: 0.3px

.wh-chip-row
  display: flex
  gap: 6px
  flex-wrap: wrap

.wh-chip
  padding: 7px 13px
  border-radius: 999px
  font-size: 13px
  font-weight: 600
  background: var(--color-card-bg)
  border: 1px solid var(--color-border)
  color: var(--color-text-secondary)
  cursor: pointer

  &--active
    background: var(--color-primary)
    border-color: var(--color-primary)
    color: #fff

.wh-toggle-row
  display: flex
  gap: 2px
  background: rgba(118, 118, 128, 0.12)
  border-radius: 9px
  padding: 2px

.wh-toggle-opt
  flex: 1
  padding: 7px 8px
  border: none
  border-radius: 7px
  background: transparent
  color: var(--color-text)
  font-size: var(--font-size-sm)
  font-weight: 500
  cursor: pointer

  &--active
    background: #FFFFFF
    color: var(--color-text)
    font-weight: 600
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12), 0 0.5px 1px rgba(0, 0, 0, 0.06)
</style>
```

- [ ] **Step 2: Проверить сборку**

Run: `cd ~/dealio && npm run build`
Expected: `✔ built in ...` без ошибок.

- [ ] **Step 3: Коммит**

```bash
cd ~/dealio
git add app/pages/warehouse-issue-form.vue
git commit -m "feat(warehouse): форма выдачи — кол-во/ед.изм./тип/получатель"
```

---

### Task 13: Баланс — `app/pages/warehouse-balance.vue`

**Files:**
- Create: `app/pages/warehouse-balance.vue`

**Interfaces:**
- Consumes: `fetchWarehouseStock` (Task 3, без параметра `category`); `employeeStore.platform`

- [ ] **Step 1: Написать файл**

```vue
<script setup lang="ts">
import {fetchWarehouseStock} from '~/utils/warehouse-sheets'
import type {WarehouseStockItem} from '~~/types/warehouse.types'
import {useErpEmployeeStore} from '~~/store/erp-employee.store'

definePageMeta({layout: 'erp'})
useSeoMeta({title: 'Баланс | ERP'})

const employeeStore = useErpEmployeeStore()

const items = ref<WarehouseStockItem[]>([])
const isLoading = ref(true)
const error = ref('')

const load = async () => {
    isLoading.value = true
    error.value = ''
    try {
        items.value = await fetchWarehouseStock(employeeStore.platform)
    } catch (loadError) {
        error.value = loadError instanceof Error ? loadError.message : 'Ошибка загрузки остатков'
    } finally {
        isLoading.value = false
    }
}

onMounted(load)
</script>

<template>
  <ErpScreen title="Баланс" icon="heroicons:scale" :subtitle="`Площадка: ${employeeStore.platform}`">
    <ErpEmptyState v-if="isLoading" loading>
      <span>Загрузка…</span>
    </ErpEmptyState>

    <ErpEmptyState v-else-if="error" error>
      <p>{{ error }}</p>
      <UiButton variant="outline" @click="load">Повторить</UiButton>
    </ErpEmptyState>

    <ErpEmptyState v-else-if="items.length === 0">
      <p>На вашей площадке нет остатков</p>
    </ErpEmptyState>

    <template v-else>
      <ErpSectionLabel>Остатки · {{ items.length }} {{ items.length === 1 ? 'позиция' : 'позиций' }}</ErpSectionLabel>
      <div class="wh-bal-table">
        <div class="wh-bal-row wh-bal-row--head">
          <span>Кат.</span>
          <span>Наименование</span>
          <span class="wh-bal-row__num">Остаток</span>
          <span>Ед.</span>
        </div>
        <div v-for="item in items" :key="`${item.cell}-${item.name}-${item.type}`" class="wh-bal-row">
          <span class="wh-bal-cat">{{ item.category }}</span>
          <span>{{ item.name }}</span>
          <span class="wh-bal-row__num">{{ item.balance }}</span>
          <span>{{ item.unit }}</span>
        </div>
      </div>
    </template>
  </ErpScreen>
</template>

<style scoped lang="sass">
.wh-bal-table
  border-radius: 13px
  overflow: hidden
  border: 1px solid var(--color-border)
  background: var(--color-card-bg)

.wh-bal-row
  display: grid
  grid-template-columns: 1.1fr 1.8fr 0.7fr 0.5fr
  gap: 6px
  padding: 9px 12px
  font-size: 12.5px
  border-bottom: 1px solid var(--color-border)
  align-items: center

  &:last-child
    border-bottom: none

  &--head
    background: var(--color-bg)
    font-weight: 700
    color: var(--color-text-secondary)
    font-size: 10.5px
    text-transform: uppercase
    letter-spacing: 0.3px

.wh-bal-row__num
  text-align: right
  font-variant-numeric: tabular-nums
  font-weight: 700

.wh-bal-cat
  font-size: 10.5px
  padding: 2px 7px
  border-radius: 6px
  background: var(--color-primary-light)
  color: var(--color-primary)
  display: inline-block
  width: fit-content
</style>
```

- [ ] **Step 2: Проверить сборку**

Run: `cd ~/dealio && npm run build`
Expected: `✔ built in ...` без ошибок.

- [ ] **Step 3: Коммит**

```bash
cd ~/dealio
git add app/pages/warehouse-balance.vue
git commit -m "feat(warehouse): экран Баланса — таблица остатков"
```

---

### Task 14: Навигация — таб-бар и подпись плитки на хабе

**Files:**
- Modify: `app/components/erp/ErpTabBar.vue`
- Modify: `app/pages/register.vue`

**Interfaces:** нет (чисто UI-правки, ничего не потребляется дальше)

- [ ] **Step 1: Расширить `isWarehouseSection` на все под-роуты склада**

В `app/components/erp/ErpTabBar.vue` заменить:

```ts
const isWarehouseSection = computed(() => route.path === '/warehouse')
```

на:

```ts
const isWarehouseSection = computed(() => route.path.startsWith('/warehouse'))
```

- [ ] **Step 2: Обновить подпись плитки «Склад» на хабе**

В `app/pages/register.vue`, в массиве `modules`, найти строку с `key: 'warehouse'` и заменить `caption: 'В разработке'` на `caption: 'Приём/выдача'`.

- [ ] **Step 3: Проверить сборку**

Run: `cd ~/dealio && npm run build`
Expected: `✔ built in ...` без ошибок.

- [ ] **Step 4: Коммит**

```bash
cd ~/dealio
git add app/components/erp/ErpTabBar.vue app/pages/register.vue
git commit -m "feat(warehouse): активный таб-бар на под-роутах, живая подпись на хабе"
```

---

### Task 15: GAS-проект «Склад» — создание, push, staging-деплой

Тот же процесс, что уже применён к ERP Ведомости в этой сессии (см. `docs/superpowers/specs/2026-07-04-erp-corporate-blue-redesign.md` не относится — процесс описан в истории сессии и в `docs/gas-clasp-feasibility.md` аналога для этого проекта нет, повторяем шаги вручную ниже).

**Files:** нет изменений в репозитории (внешние Google-ресурсы), кроме заметки в PR/коммите ниже.

- [ ] **Step 1: Создать standalone GAS-проект**

Run (в `/tmp` или отдельной scratch-папке, не в `~/dealio`):
```bash
mkdir -p /tmp/dealio-warehouse-gas && cd /tmp/dealio-warehouse-gas
npx --yes @google/clasp create --type standalone --title "Склад (ERP)" --rootDir .
```
Expected: `Created new script: https://script.google.com/d/<SCRIPT_ID>/edit`

- [ ] **Step 2: Настроить манифест под Web App**

Файл `appsscript.json` в этой же папке — заменить содержимое:
```json
{
  "timeZone": "Europe/Moscow",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

- [ ] **Step 3: Скопировать код и запушить черновик**

Run:
```bash
cp ~/dealio/scripts/warehouse-gas-webapp.js /tmp/dealio-warehouse-gas/Код.js
cd /tmp/dealio-warehouse-gas && npx --yes @google/clasp push --force
```
Expected: `Pushed 2 files`

- [ ] **Step 4: Пользователь создаёт копию таблицы «Склад» для staging**

**Требует действия пользователя** (та же схема, что и для ERP Ведомости): в Google Sheets открыть таблицу `<WAREHOUSE_SPREADSHEET_ID>` → «Файл → Создать копию» → дать доступ «у кого есть ссылка» → прислать ID копии.

- [ ] **Step 5: Пользователь настраивает Script Property и деплоит staging**

**Требует действия пользователя**: открыть `https://script.google.com/d/<SCRIPT_ID>/edit` → шестерёнка (Настройки проекта) → Script Properties → добавить `SPREADSHEET_ID` = `<ID копии из шага 4>` → «Развернуть → Новое развёртывание → Веб-приложение» → Execute as: Я, Access: Все → прислать итоговый `/exec` URL.

---

### Task 16: Прогон всех сценариев на staging

**Files:** нет изменений в репозитории — только запуск и наблюдение.

- [ ] **Step 1: Поднять dev-сервер на staging GAS URL**

Run:
```bash
cd ~/dealio
NUXT_PUBLIC_WAREHOUSE_GAS_URL="<staging /exec URL из Task 15>" \
NUXT_PUBLIC_ERP_GAS_URL="<staging ERP URL, если ещё поднят>" \
npm run dev -- --port 3311
```

- [ ] **Step 2: Проверить Приём через Playwright/браузер**

Через инъекцию тестового профиля в localStorage (`erp-employee-profile`, как делалось для остальных модулей в этой сессии) с `access.warehouse: true` и `platform`, совпадающим с площадкой в копии таблицы → зайти на `/warehouse-receive` → выбрать категорию → выбрать товар → заполнить количество/ед.изм./ячейку/тип → «Принять».
Expected: toast «Товар принят», редирект на `/warehouse-receive`.

- [ ] **Step 3: Проверить, что в копии «Склад»/«Лог» появилась запись**

Открыть staging-копию таблицы → лист «Лог»: последняя строка содержит верные Дата/Площадка/Действие=«Прием»/Ячейка/Наименование/Тип/Кол-во/Ед.изм./Принял, столбец «Категория» пуст. Лист «Склад»: если комбинация была новой — появилась новая строка с формулами и корректным «Остаток» (сначала — равным принятому количеству).

- [ ] **Step 4: Проверить Выдачу**

Зайти на `/warehouse-issue` → выбрать категорию → выбрать позицию из списка (должен показывать остаток, только что принятый в Step 2) → на форме поменять «Тип» на другой, отличный от исходного → указать количество больше исходного остатка для НОВОГО (изменённого) типа → «Выдать».
Expected: ошибка «Недостаточно остатка: доступно 0» (так как для изменённого типа остатка ещё нет) — подтверждает, что сервер пересчитывает ID из финальных значений формы, а не из исходно выбранной строки.

- [ ] **Step 5: Повторить Выдачу с исходным типом**

Вернуться, выбрать ту же позицию, оставить Тип/Ед.изм. как есть, указать количество меньше остатка, указать ФИО получателя → «Выдать».
Expected: toast «Товар выдан», в «Лог» — новая строка с Действие=«Выдача», Выдал/Получил заполнены, Принял пуст; «Остаток» в «Складе» уменьшился на выданное количество.

- [ ] **Step 6: Проверить Баланс**

Зайти на `/warehouse-balance` → убедиться, что видна только что изменённая позиция с корректным остатком, категория/наименование/ед.изм. отображаются верно.

- [ ] **Step 7: Проверить access-guard**

С профилем `access.warehouse: false` попытаться перейти на `/warehouse-receive` (прямой `page.goto`).
Expected: редирект на `/register`.

- [ ] **Step 8: Остановить dev-сервер**

Run: `lsof -ti:3311 | xargs -r kill`

---

### Task 17: Прод-деплой (только после явного подтверждения пользователя)

**Не выполнять без отдельного «да» от пользователя на каждый шаг** — тот же протокол, что был для ERP Ведомости в этой сессии.

- [ ] **Step 1: Запушить код бэкенда в прод-черновик GAS**

Run:
```bash
mkdir -p /tmp/dealio-warehouse-gas-prod && cd /tmp/dealio-warehouse-gas-prod
npx --yes @google/clasp clone-script "<SCRIPT_ID из Task 15>"
cp ~/dealio/scripts/warehouse-gas-webapp.js Код.js
npx --yes @google/clasp push --force
```

- [ ] **Step 2: Создать версию и первый прод-деплой**

Run:
```bash
cd /tmp/dealio-warehouse-gas-prod
npx --yes @google/clasp deploy -d "Первый прод-деплой модуля Склад"
```
Expected: `Deployed <DEPLOYMENT_ID> @1` — это и есть прод `/exec` URL для `NUXT_PUBLIC_WAREHOUSE_GAS_URL`.

- [ ] **Step 3: Пользователь заводит секрет в GitHub**

**Требует действия пользователя**: репозиторий `dealio` → Settings → Secrets and variables → Actions → New repository secret → имя `NUXT_PUBLIC_WAREHOUSE_GAS_URL`, значение — URL из Step 2.

- [ ] **Step 4: Push фронтенд-коммитов и деплой**

Run (после явного «да» пользователя):
```bash
cd ~/dealio && git push origin main
gh run list --limit 1 --json databaseId -q '.[0].databaseId'
```
Затем дождаться `completed success` (см. паттерн поллинга через Monitor, использованный в этой сессии для предыдущих деплоев).

- [ ] **Step 5: Финальная проверка на живом проде**

Повторить Steps 2, 4, 6, 7 из Task 16, но на `https://artemegorov007.github.io/dealio/warehouse` — с явно тестовым ФИО/позицией и обязательной очисткой тестовых записей там, где это возможно через API (`deleteIssuedBadge`-аналога для склада нет — как и с «Логисты»/«Промеры» в ERP Ведомости, тестовые строки в «Лог»/«Склад» для склада тоже не имеют API для удаления; предупредить пользователя заранее и по возможности тестировать минимально — например, только Баланс (read-only) и один цикл Приём/Выдача одного и того же количества с ОДИНАКОВЫМ товаром, чтобы Остаток вернулся к исходному значению, даже если сами строки «Лог» останутся).

---

## Self-Review

**Spec coverage:**
- 1 экран (выбор действия) → Task 8. ✅
- 2 экран (Приём: категории→список→форма, запись в «Лог» с указанными полями) → Tasks 1, 9, 10. ✅
- 3 экран (Выдача: категории→список остатков→форма, запись в «Лог») → Tasks 1, 11, 12. ✅
- 4 экран (Баланс: таблица Категория/Наименование/Остаток/Ед.изм., фильтр Площадка+Остаток>0) → Tasks 1, 13. ✅
- ID-формат, автосоздание строки в «Склад», фикс-список ед.изм., отдельный GAS-проект, access-guard, редактируемые Тип/Ед.изм. на Выдаче с серверным пересчётом ID — все решения из спеки отражены в Task 1 (backend) и Tasks 9–12 (frontend). ✅
- Тестирование на staging перед прод — Tasks 15–17. ✅

**Placeholder scan:** плейсхолдеров/«TODO»/«добавить обработку ошибок» не найдено — весь код в шагах полный, вручную проверено построчно.

**Type consistency:** `WarehouseStockItem{cell,name,type,category,balance,unit}` — одинаковая форма в Task 2 (объявление), Task 1 (GAS `getStock_`, поля в том же порядке), Task 3 (клиент), Tasks 11–13 (использование). `receiveWarehouseItem`/`issueWarehouseItem` payload-поля совпадают между Task 3 (интерфейсы `ReceiveItemPayload`/`IssueItemPayload`) и Tasks 10/12 (вызовы). Имена стора (`setWarehouseReceiveItem`/`clearWarehouseReceiveItem`/`setWarehouseIssueItem`/`clearWarehouseIssueItem`/`hasWarehouseReceiveItem`/`hasWarehouseIssueItem`) одинаковы в Task 4 (объявление) и Tasks 9–12 (использование).
