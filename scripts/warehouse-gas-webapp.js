/**
 * Склад — Web App для приёма/выдачи товара.
 * Отдельный GAS-проект от ERP Ведомости — своя таблица, свой деплой.
 *
 * Script Property SPREADSHEET_ID обязателен (ID не хранится в публичном репо).
 *
 * GET  ?action=categories
 * GET  ?action=items&category=...
 * GET  ?action=stock&platform=...&category=...   (category опционален)
 * GET  ?action=platforms
 * POST { action: 'receiveItem', platform, cell, name, type, qty, unit, fio }
 * POST { action: 'issueItem',   platform, cell, name, type, qty, unit, fio, recipientFio }
 */
function requiredScriptProperty_(key) {
    const value = PropertiesService.getScriptProperties().getProperty(key)
    if (!value) {
        throw new Error('Задайте Script Property ' + key)
    }
    return value
}

const SPREADSHEET_ID = requiredScriptProperty_('SPREADSHEET_ID')

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

        if (action === 'platforms') {
            return jsonResponse_({ok: true, platforms: getPlatforms_()})
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

// Склад: A ID | B Площадка | ...
function getPlatforms_() {
    const sheet = getSheet_(STOCK_SHEET)
    const values = sheet.getDataRange().getValues()
    const platforms = []
    const seen = {}
    for (let i = 1; i < values.length; i += 1) {
        const platform = normalizeCell_(values[i][1])
        if (platform && !seen[platform]) {
            seen[platform] = true
            platforms.push(platform)
        }
    }
    platforms.sort((a, b) => a.localeCompare(b, 'ru'))
    return platforms
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
    const platform = String(payload.platform || '').trim()
    const cell = String(payload.cell || '').trim()
    const name = String(payload.name || '').trim()
    const type = String(payload.type || '').trim()
    const qty = Number(payload.qty)
    const unit = String(payload.unit || '')
    const fio = String(payload.fio || '')

    if (!platform || !cell || !name || !type || !qty || qty <= 0 || !unit) {
        throw new Error('Заполните все поля')
    }

    const requestId = String(payload.requestId || '')
    const category = findCategoryForItem_(name)

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) throw new Error('busy')

    try {
        if (isDuplicateRequest_(requestId)) return

        ensureStockRow_(platform, cell, name, type, category, unit)
        appendLogRow_({
            platform: platform, action: 'Прием', cell: cell, name: name, type: type,
            qty: qty, unit: unit, receivedBy: fio, issuedBy: '', recipientFio: '',
            id: buildId_(platform, cell, name, type, category),
        })
        markRequestDone_(requestId)
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
    const platform = String(payload.platform || '').trim()
    const cell = String(payload.cell || '').trim()
    const name = String(payload.name || '').trim()
    const type = String(payload.type || '').trim()
    const qty = Number(payload.qty)
    const unit = String(payload.unit || '')
    const fio = String(payload.fio || '')
    const recipientFio = String(payload.recipientFio || '').trim()

    if (!platform || !cell || !name || !type || !qty || qty <= 0 || !unit || !recipientFio) {
        throw new Error('Заполните все поля')
    }

    const requestId = String(payload.requestId || '')
    const category = findCategoryForItem_(name)
    const id = buildId_(platform, cell, name, type, category)

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) throw new Error('busy')

    try {
        if (isDuplicateRequest_(requestId)) return

        const sheet = getSheet_(STOCK_SHEET)
        const rowNumber = findStockRow_(sheet, id)
        const balance = rowNumber > 0 ? (Number(sheet.getRange(rowNumber, 9).getValue()) || 0) : 0

        if (qty > balance) throw new Error('Недостаточно остатка: доступно ' + balance)

        appendLogRow_({
            platform: platform, action: 'Выдача', cell: cell, name: name, type: type,
            qty: qty, unit: unit, receivedBy: '', issuedBy: fio, recipientFio: recipientFio,
            id: id,
        })
        markRequestDone_(requestId)
    } finally {
        lock.releaseLock()
    }
}

/**
 * GAS Web App POST-ответы идут через редирект на script.googleusercontent.com,
 * который иногда 404-ит на клиенте уже ПОСЛЕ того, как сервер полностью
 * отработал запрос — клиент видит ошибку и слепой повтор реально задваивает
 * Приём/Выдачу. requestId — на фронте генерируется один раз на конкретный
 * набор значений формы (см. useIdempotencyKey) и переиспользуется при повторе
 * с теми же значениями, так что второй вызов с тем же ID безопасно не делает
 * повторную запись. TTL 21600с — максимум для CacheService, с большим запасом
 * покрывает любой правдоподобный ручной повтор.
 */
const IDEMPOTENCY_TTL_SECONDS = 21600

function isDuplicateRequest_(requestId) {
    if (!requestId) return false
    return CacheService.getScriptCache().get('wh_req_' + requestId) === '1'
}

function markRequestDone_(requestId) {
    if (!requestId) return
    CacheService.getScriptCache().put('wh_req_' + requestId, '1', IDEMPOTENCY_TTL_SECONDS)
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
