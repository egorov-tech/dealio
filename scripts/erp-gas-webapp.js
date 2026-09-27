/**
 * CRM «Ведомости» — отдельный Web App для выдачи бирок.
 * Бота FindTagMFT не трогает — свой Apps Script проект, своя деплойка.
 *
 * 1. Extensions → Apps Script в таблице заказчика (ID только в Script Properties)
 * 2. Вставить этот файл, Deploy → New deployment → Web app
 * 3. Execute as: Me · Who has access: Anyone
 * 4. Script Properties (обязательно):
 *    SPREADSHEET_ID, ACCESS_SPREADSHEET_ID, REPORTS_SPREADSHEET_ID
 * 5. URL → NUXT_PUBLIC_ERP_GAS_URL
 *
 * GET  ?action=badges&workshop=kolpino|volkhonka
 * GET  ?action=issuedToday&fio=...&workshop=kolpino|volkhonka  (fio/workshop опциональны)
 * GET  ?action=handedOverToday&fio=...                            (fio опционален)
 * GET  ?action=packingToday&fio=...&machine=1..10
 * GET  ?action=reportsKs&token=...       (лист «КС»: A договор, B номер, C сумма с НДС, D статус)
 * GET  ?action=reportsId&token=...       (лист «ИД»: B договор, далее статус/площадь/стоимость)
 * POST { action: 'issueBadge',       workshop, fio, badgeContent }
 * POST { action: 'deleteIssuedBadge', row, fio, badgeContent }
 * POST { action: 'recordPacking',    platform, fio, machine, qrText }
 * POST { action: 'recordHandover',   fio, badgeContent }
 * POST { action: 'undoHandover',     row, fio, badgeContent }
 * POST { action: 'recordMeasurement', fio, badge, coverage, zone1..zone5 }
 * POST { action: 'login',            login, password }
 */
function requiredScriptProperty_(key) {
    const value = PropertiesService.getScriptProperties().getProperty(key)
    if (!value) {
        throw new Error('Задайте Script Property ' + key)
    }
    return value
}

const SPREADSHEET_ID = requiredScriptProperty_('SPREADSHEET_ID')
const ISSUE_SHEET = 'Выдача'
const JOURNAL_SHEET = 'Журнал выдачи бирок'
const LOGIST_SHEET = 'Логисты'
const HANDOVER_SHEET = 'Сдача'
const MEASUREMENT_SHEET = 'Промеры'
const REPORTS_SPREADSHEET_ID = requiredScriptProperty_('REPORTS_SPREADSHEET_ID')
const REPORTS_SHEET_NAME = PropertiesService.getScriptProperties().getProperty('REPORTS_SHEET_NAME') || 'Лист15'
const REPORTS_BRIDGE_TOKEN = PropertiesService.getScriptProperties().getProperty('REPORTS_BRIDGE_TOKEN') || ''
// «КС» и «ИД» — те же Script Properties, что и у остального отчёта: своя
// таблица (обычно та же REPORTS_SPREADSHEET_ID), свой лист. Имена листов
// переопределяются свойством на случай, если реальные вкладки называются
// иначе — не гадать при каждом деплое, а поменять один Script Property.
const REPORTS_KS_SHEET_NAME = PropertiesService.getScriptProperties().getProperty('REPORTS_KS_SHEET_NAME') || 'КС'
const REPORTS_ID_SHEET_NAME = PropertiesService.getScriptProperties().getProperty('REPORTS_ID_SHEET_NAME') || 'ИД'

// Имя цеха = имя колонки на листе «Выдача» = имя исходного листа с бирками.
const WORKSHOP_SHEETS = {
    kolpino: 'Колпино',
    volkhonka: 'Волхонка',
}

// Отдельная таблица доступа сотрудников (логины/пароли/статусы) — НЕ «Ведомости».
const ACCESS_SPREADSHEET_ID = requiredScriptProperty_('ACCESS_SPREADSHEET_ID')
const STAFF_SHEET = 'Сотрудники'
const ACTIVE_STATUS = 'Работает'
// Колонка K — первая колонка прав и доступов на листе «Сотрудники».
// Храним границу явно, чтобы K («Доступ к биркам») не исчезла при правках.
const PERSONNEL_RIGHTS_START_INDEX = 10

function doGet(e) {
    try {
        const action = e.parameter.action

        if (action === 'badges') {
            const badges = getWorkshopBadges_(e.parameter.workshop)
            return jsonResponse_({ok: true, badges: badges})
        }

        if (action === 'issuedToday') {
            const entries = getIssuedBadgesToday_(e.parameter.fio || '', e.parameter.workshop || '')
            return jsonResponse_({ok: true, entries: entries})
        }

        if (action === 'handedOverToday') {
            const entries = getHandedOverBadgesToday_(e.parameter.fio || '')
            return jsonResponse_({ok: true, entries: entries})
        }

        if (action === 'packingToday') {
            const entries = getPackingToday_(e.parameter.fio || '', e.parameter.machine || '')
            return jsonResponse_({ok: true, packingEntries: entries})
        }

        if (action === 'reportsCurrent') {
            return jsonResponse_({ok: true, data: reportsCurrent_(e.parameter.token || '')})
        }

        if (action === 'reportsKs') {
            return jsonResponse_({ok: true, data: reportsKs_(e.parameter.token || '')})
        }

        if (action === 'reportsId') {
            return jsonResponse_({ok: true, data: reportsId_(e.parameter.token || '')})
        }

        if (action === 'reportsHeader') {
            return jsonResponse_({ok: true, data: reportsHeader_(e.parameter.token || '', e.parameter.sheet || '')})
        }

        return jsonResponse_({ok: false, error: 'Unknown action'})
    } catch (error) {
        return jsonResponse_({ok: false, error: String(error.message || error)})
    }
}

function doPost(e) {
    try {
        const payload = JSON.parse(e.postData.contents)

        if (payload.action === 'issueBadge') {
            issueBadge_(payload.workshop, payload.fio || '', payload.badgeContent || '')
            return jsonResponse_({ok: true})
        }

        if (payload.action === 'deleteIssuedBadge') {
            deleteIssuedBadge_(payload.row, payload.fio || '', payload.badgeContent || '')
            return jsonResponse_({ok: true})
        }

        if (payload.action === 'recordPacking') {
            recordPacking_(payload.platform || '', payload.fio || '', payload.machine || '', payload.qrText || '')
            return jsonResponse_({ok: true})
        }

        if (payload.action === 'recordHandover') {
            recordHandover_(payload.fio || '', payload.badgeContent || '')
            return jsonResponse_({ok: true})
        }

        if (payload.action === 'undoHandover') {
            undoHandover_(payload.row, payload.fio || '', payload.badgeContent || '')
            return jsonResponse_({ok: true})
        }

        if (payload.action === 'recordMeasurement') {
            recordMeasurement_(
                payload.fio || '',
                payload.badge || '',
                payload.coverage || '',
                payload.zone1 || '',
                payload.zone2 || '',
                payload.zone3 || '',
                payload.zone4 || '',
                payload.zone5 || '',
            )
            return jsonResponse_({ok: true})
        }

        if (payload.action === 'login') {
            const profile = login_(payload.login || '', payload.password || '')
            return jsonResponse_({
                ok: true,
                fio: profile.fio,
                department: profile.department,
                position: profile.position,
                platform: profile.platform,
                role: profile.role,
                login: profile.login,
                password: profile.password,
                access: profile.access,
            })
        }

        if (payload.action === 'personnelDepartments') {
            const context = requirePersonnelActor_(payload.actorLogin || '', payload.actorPassword || '')
            return jsonResponse_({
                ok: true,
                departments: personnelDepartments_(context),
                platforms: personnelPlatforms_(),
                rights: personnelRights_(context),
            })
        }

        if (payload.action === 'personnelEmployees') {
            const context = requirePersonnelActor_(payload.actorLogin || '', payload.actorPassword || '')
            return jsonResponse_({
                ok: true,
                employees: personnelEmployees_(context, payload.department || ''),
            })
        }

        if (payload.action === 'personnelEmployee') {
            const context = requirePersonnelActor_(payload.actorLogin || '', payload.actorPassword || '')
            return jsonResponse_({
                ok: true,
                employee: personnelEmployee_(context, payload.row, payload.fio || ''),
            })
        }

        if (payload.action === 'personnelSave') {
            const context = requirePersonnelActor_(payload.actorLogin || '', payload.actorPassword || '')
            return jsonResponse_({ok: true, employee: savePersonnelEmployee_(context, payload)})
        }

        if (payload.action === 'personnelCreate') {
            const context = requirePersonnelActor_(payload.actorLogin || '', payload.actorPassword || '')
            return jsonResponse_({ok: true, employee: createPersonnelEmployee_(context, payload)})
        }

        if (payload.action === 'personnelDismiss') {
            const context = requirePersonnelActor_(payload.actorLogin || '', payload.actorPassword || '')
            dismissPersonnelEmployee_(context, payload.row, payload.fio || '')
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

function reportsCurrent_(token) {
    requireReportsToken_(token)
    const sheet = requireReportsSheet_(REPORTS_SHEET_NAME)
    return {
        sourceReadAt: new Date().toISOString(),
        rows: normalizeReportsRows_(sheet.getDataRange().getDisplayValues()),
    }
}

function reportsNumber_(value) {
    const normalized = normalizeCell_(value).replace(/[\s\u00A0]/g, '').replace(',', '.')
    if (!normalized) return 0
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : 0
}

function isNumericCell_(value) {
    const normalized = normalizeCell_(value).replace(/[\s\u00A0]/g, '').replace(',', '.')
    return normalized !== '' && Number.isFinite(Number(normalized))
}

/**
 * Заголовки листа с буквами колонок — диагностика связей с источником.
 *
 * Колонки в ТЗ задают буквами, а в таблице перед ними легко появляется
 * лишний столбец нумерации — тогда весь раздел молча показывает соседние
 * данные (договором становится номер строки, суммой — статус). Сверять это
 * глазами по экрану дорого, поэтому мост умеет показать, что он видит.
 */
function reportsHeader_(token, sheetName) {
    requireReportsToken_(token)
    const sheet = requireReportsSheet_(sheetName || REPORTS_SHEET_NAME)
    const values = sheet.getRange(1, 1, Math.min(2, sheet.getLastRow()), sheet.getLastColumn()).getDisplayValues()
    const columns = []
    for (let index = 0; index < values[0].length; index += 1) {
        columns.push({
            letter: columnLetter_(index),
            header: normalizeCell_(values[0][index]),
            firstRow: values.length > 1 ? normalizeCell_(values[1][index]) : '',
        })
    }
    return {sheet: sheet.getName(), columns: columns}
}

function columnLetter_(index) {
    let letter = ''
    let rest = index
    while (rest >= 0) {
        letter = String.fromCharCode(65 + (rest % 26)) + letter
        rest = Math.floor(rest / 26) - 1
    }
    return letter
}

function requireReportsToken_(token) {
    // Пустое свойство и неверный токен — разные поломки: первую чинит
    // настройка скрипта, вторую — конфиг сервера. Одинаковый текст ошибки
    // заставлял гадать, какая из них случилась.
    if (!REPORTS_BRIDGE_TOKEN) {
        throw new Error('Не настроен токен отчётов (Script Property REPORTS_BRIDGE_TOKEN)')
    }
    if (token !== REPORTS_BRIDGE_TOKEN) {
        throw new Error('Нет доступа к отчётам')
    }
}

/**
 * Лист отчётов по имени, устойчиво к пробелам и регистру.
 *
 * В ТЗ вкладка называется «Лист 15», в настройках скрипта — «Лист15»: один
 * пробел роняет весь раздел, и снаружи это выглядит как «отчёты не видят
 * данные». Сначала точное имя, затем сравнение без пробелов и регистра.
 * Если не нашли — перечисляем реальные вкладки, чтобы не искать вслепую.
 */
function requireReportsSheet_(sheetName) {
    if (!REPORTS_SPREADSHEET_ID) {
        throw new Error('Не настроен источник отчётов (Script Property REPORTS_SPREADSHEET_ID)')
    }
    const spreadsheet = SpreadsheetApp.openById(REPORTS_SPREADSHEET_ID)
    const exact = spreadsheet.getSheetByName(sheetName)
    if (exact) return exact

    const wanted = sheetKey_(sheetName)
    const sheets = spreadsheet.getSheets()
    const names = []
    for (let index = 0; index < sheets.length; index += 1) {
        const name = sheets[index].getName()
        names.push(name)
        if (sheetKey_(name) === wanted) return sheets[index]
    }
    throw new Error('Не найден лист отчётов «' + sheetName + '». Есть: ' + names.join(', '))
}

function sheetKey_(name) {
    return normalizeCell_(name).replace(/[\s\u00A0]/g, '').toLowerCase()
}

// Слова, по которым шапка узнаётся наверняка, чем бы ни была заполнена
// денежная колонка: шапка вида «2024» — тоже число.
const REPORTS_HEADER_WORDS = ['Договор', 'КС', 'Статус', 'Площадь', 'Сумма с НДС', 'Стоимость с НДС']

/**
 * С какой строки начинаются данные на листе, который читается по буквам
 * колонок.
 *
 * При чтении по заголовкам первая строка пропускается всегда — она и есть
 * заголовок. По буквам такой гарантии нет: на листе без шапки первая строка
 * это уже данные, и молча пропущенная строка испортила бы «Итого» — цифру,
 * по которой сверяются с бухгалтерией. Сначала ищем в строке знакомое слово
 * шапки, и только если его нет — смотрим на денежную колонку: число значит,
 * что шапки нет.
 */
function firstDataRowIndex_(values, numericIndex) {
    if (!values.length) return 1
    const first = values[0].map(normalizeCell_)
    for (let index = 0; index < REPORTS_HEADER_WORDS.length; index += 1) {
        if (first.indexOf(REPORTS_HEADER_WORDS[index]) >= 0) return 1
    }
    return isNumericCell_(values[0][numericIndex]) ? 0 : 1
}

/** Колонка по одному из заголовков, а если шапки нет — по позиции из ТЗ. */
function columnIndexOr_(header, names, fallbackIndex) {
    for (let nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
        const found = header.indexOf(names[nameIndex])
        if (found >= 0) return found
    }
    return fallbackIndex
}

function normalizeReportsRows_(values) {
    if (!values.length) return []

    const header = values[0].map(normalizeCell_)
    const customerIndex = requireColumn_(header, 'Заказчик', 'Отчёты')
    const contractIndex = requireColumn_(header, 'Договор', 'Отчёты')
    const siteIndex = requireColumn_(header, 'Площадка', 'Отчёты')
    const productionIndex = requireColumn_(header, 'ТП за месяц, тн', 'Отчёты')
    const shippedIndex = requireColumn_(header, 'Отгружено за месяц, тн', 'Отчёты')
    const workshopIndex = requireColumn_(header, 'В цехе, тн', 'Отчёты')
    // Метрики за весь период («Полный отчёт») и отгрузка в м² («Отчёт
    // месяца»). В ТЗ они заданы буквами, но буквы разъехались с листом:
    // E — это «Поступило, тн», а отгрузка за период лежит в F. Показывать
    // поступление под видом отгрузки нельзя тем более, что по тому же ТЗ
    // поступление в этом разделе видеть не хотят. Поэтому читаем по
    // заголовкам, а буквы из ТЗ оставляем запасным вариантом.
    const productionTotalIndex = columnIndexOr_(header, ['ТП, руб'], 3)
    const shippedTotalIndex = columnIndexOr_(header, ['Отгружено, тн'], 5)
    const shippedAreaIndex = columnIndexOr_(header, ['Отгружено за месяц, м2', 'Отгружено за месяц, м²'], 10)

    const rows = []
    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        const customer = normalizeCell_(row[customerIndex])
        const contract = normalizeCell_(row[contractIndex])
        const site = normalizeCell_(row[siteIndex])
        if (!customer || !contract || !site) continue
        rows.push({
            customer: customer,
            contract: contract,
            site: site,
            productionRub: reportsNumber_(row[productionIndex]),
            shippedTons: reportsNumber_(row[shippedIndex]),
            inWorkshopTons: reportsNumber_(row[workshopIndex]),
            shippedSquareMeters: reportsNumber_(row[shippedAreaIndex]),
            productionTotalRub: reportsNumber_(row[productionTotalIndex]),
            shippedTotalTons: reportsNumber_(row[shippedTotalIndex]),
        })
    }
    return rows
}

/**
 * Лист «КС»: A — договор, B — номер КС, C — сумма с НДС, D — статус.
 * Построчно, без итоговой строки: «Итого» считает клиент вместе с
 * группировкой по договору.
 */
function reportsKs_(token) {
    requireReportsToken_(token)
    const sheet = requireReportsSheet_(REPORTS_KS_SHEET_NAME)
    return {
        sourceReadAt: new Date().toISOString(),
        rows: normalizeKsRows_(sheet.getDataRange().getDisplayValues()),
    }
}

function normalizeKsRows_(values) {
    if (!values.length) return []

    const header = values[0].map(normalizeCell_)
    // Буквы из ТЗ сдвинуты на колонку: первым на листе идёт «ID», поэтому
    // договор лежит в B, а не в A. Заголовки на листе есть и точны — читаем
    // по ним, буквы держим запасным вариантом со сдвигом на этот «ID».
    const contractIndex = columnIndexOr_(header, ['Договор'], 1)
    const numberIndex = columnIndexOr_(header, ['Номер КС', '№'], 2)
    const amountIndex = columnIndexOr_(header, ['Стоимость с НДС', 'Сумма с НДС'], 3)
    const statusIndex = columnIndexOr_(header, ['Статус'], 4)

    const rows = []
    for (let rowIndex = firstDataRowIndex_(values, amountIndex); rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        const contract = normalizeCell_(row[contractIndex])
        const number = normalizeCell_(row[numberIndex])
        if (!contract || !number) continue
        rows.push({
            contract: contract,
            number: number,
            amountWithVat: reportsNumber_(row[amountIndex]),
            status: normalizeCell_(row[statusIndex]),
        })
    }
    return rows
}

/**
 * Лист «ИД»: договор — колонка B, дальше статус / площадь / стоимость с НДС.
 * Строка уже сама по себе группа статуса внутри договора (в отличие от «КС»,
 * где строка — отдельный номер КС), клиент только раскладывает по договору.
 */
function reportsId_(token) {
    requireReportsToken_(token)
    const sheet = requireReportsSheet_(REPORTS_ID_SHEET_NAME)
    return {
        sourceReadAt: new Date().toISOString(),
        rows: normalizeIdRows_(sheet.getDataRange().getDisplayValues()),
    }
}

function normalizeIdRows_(values) {
    if (!values.length) return []

    const header = values[0].map(normalizeCell_)
    // В ТЗ договор указан в колонке B, но там лежит шифр АОСР: договор — в
    // C, а площадь, стоимость и статус ещё правее (F, G, H). Читаем по
    // заголовкам, буквы — запасной вариант по фактической раскладке листа.
    const contractIndex = columnIndexOr_(header, ['Договор'], 2)
    const statusIndex = columnIndexOr_(header, ['Статус'], 7)
    const areaIndex = columnIndexOr_(header, ['Площадь'], 5)
    const amountIndex = columnIndexOr_(header, ['Стоимость', 'Стоимость с НДС', 'Сумма с НДС'], 6)

    const rows = []
    for (let rowIndex = firstDataRowIndex_(values, amountIndex); rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        const contract = normalizeCell_(row[contractIndex])
        const status = normalizeCell_(row[statusIndex])
        if (!contract || !status) continue
        rows.push({
            contract: contract,
            status: status,
            area: reportsNumber_(row[areaIndex]),
            amountWithVat: reportsNumber_(row[amountIndex]),
        })
    }
    return rows
}

function getWorkshopSheetName_(workshop) {
    const sheetName = WORKSHOP_SHEETS[workshop]
    if (!sheetName) {
        throw new Error('Unknown workshop: ' + workshop)
    }
    return sheetName
}

function getWorkshopBadges_(workshop) {
    const columnName = getWorkshopSheetName_(workshop)

    const sheet = getSpreadsheet_().getSheetByName(ISSUE_SHEET)
    if (!sheet) {
        throw new Error('Sheet not found: ' + ISSUE_SHEET)
    }

    const values = sheet.getDataRange().getValues()
    if (!values.length) return []

    const header = values[0].map(normalizeCell_)
    const columnIndex = header.indexOf(normalizeCell_(columnName))

    if (columnIndex < 0) {
        throw new Error('Column not found: ' + columnName)
    }

    const badges = []

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const value = normalizeCell_(values[rowIndex][columnIndex])
        if (value) badges.push(value)
    }

    return badges
}

/**
 * Пишет строку в журнал. По прямому указанию заказчика — больше НЕ
 * трогает листы цехов (Колпино/Волхонка), только «Журнал выдачи бирок».
 * Бирка из листа «Выдача» сама после этого не пропадает.
 *
 * Заказчик переставил/переименовал столбцы на «Журнал выдачи бирок» —
 * пишем по заголовку, а не по фиксированному индексу. Заполняем только
 * День (дата+время), Дата (только дата), Цех, Инженер, Бирка — остальные
 * столбцы не трогаем.
 */
function issueBadge_(workshop, fio, badgeContent) {
    const workshopLabel = getWorkshopSheetName_(workshop)
    const sheet = getJournalSheet_()
    const header = getSheetHeader_(sheet)

    const dayIndex = requireColumn_(header, 'День', JOURNAL_SHEET)
    const dateIndex = requireColumn_(header, 'Дата', JOURNAL_SHEET)
    const workshopIndex = requireColumn_(header, 'Цех', JOURNAL_SHEET)
    const engineerIndex = requireColumn_(header, 'Инженер', JOURNAL_SHEET)
    const badgeIndex = requireColumn_(header, 'Бирка', JOURNAL_SHEET)

    const now = new Date()
    const row = new Array(header.length).fill('')
    row[dayIndex] = now
    row[dateIndex] = now
    row[workshopIndex] = workshopLabel
    row[engineerIndex] = fio
    row[badgeIndex] = badgeContent

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) {
        throw new Error('busy')
    }

    try {
        sheet.appendRow(row)
    } finally {
        lock.releaseLock()
    }
}

/**
 * Бирки, выданные сегодня — для экрана «Бирки за смену».
 * fio опционален для счётчика менеджера; workshop — для списка цеха.
 */
function getIssuedBadgesToday_(fio, workshop) {
    const sheet = getJournalSheet_()
    const header = getSheetHeader_(sheet)

    const dayIndex = requireColumn_(header, 'День', JOURNAL_SHEET)
    const workshopIndex = requireColumn_(header, 'Цех', JOURNAL_SHEET)
    const engineerIndex = requireColumn_(header, 'Инженер', JOURNAL_SHEET)
    const badgeIndex = requireColumn_(header, 'Бирка', JOURNAL_SHEET)

    const workshopLabelFilter = workshop ? getWorkshopSheetName_(workshop) : ''
    const fioNormalized = normalizeCell_(fio)
    const todayKey = formatDateKey_(new Date())

    const values = sheet.getDataRange().getValues()
    const entries = []

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        const rowDate = row[dayIndex]

        if (fioNormalized && normalizeCell_(row[engineerIndex]) !== fioNormalized) continue
        if (workshopLabelFilter && normalizeCell_(row[workshopIndex]) !== workshopLabelFilter) continue
        if (!(rowDate instanceof Date) || formatDateKey_(rowDate) !== todayKey) continue

        entries.push({
            row: rowIndex + 1,
            badge: normalizeCell_(row[badgeIndex]),
            time: Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'HH:mm'),
        })
    }

    return entries
}

/**
 * Удаляет выданную бирку из журнала — кнопка-крестик на экране «Бирки за смену».
 */
function deleteIssuedBadge_(row, fio, badgeContent) {
    const rowNumber = Number(row)
    const sheet = getJournalSheet_()
    const header = getSheetHeader_(sheet)
    const engineerIndex = requireColumn_(header, 'Инженер', JOURNAL_SHEET)
    const badgeIndex = requireColumn_(header, 'Бирка', JOURNAL_SHEET)

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) {
        throw new Error('busy')
    }

    try {
        if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
            throw new Error('Строка не найдена — обновите список и попробуйте снова')
        }

        const rowValues = sheet.getRange(rowNumber, 1, 1, header.length).getValues()[0]
        const rowMatches = normalizeCell_(rowValues[engineerIndex]) === normalizeCell_(fio)
            && normalizeCell_(rowValues[badgeIndex]) === normalizeCell_(badgeContent)

        if (!rowMatches) {
            throw new Error('Строка изменилась — обновите список и попробуйте снова')
        }

        sheet.deleteRow(rowNumber)
    } finally {
        lock.releaseLock()
    }
}

/**
 * Сдача работ — создаёт новую строку в листе «Сдача».
 * Столбцы: Дата, Инженер, Бирка.
 */
function recordHandover_(fio, badgeContent) {
    const sheet = getOrCreateHandoverSheet_()
    const header = getSheetHeader_(sheet)

    const dateIndex = requireColumn_(header, 'Дата', HANDOVER_SHEET)
    const engineerIndex = requireColumn_(header, 'Инженер', HANDOVER_SHEET)
    const badgeIndex = requireColumn_(header, 'Бирка', HANDOVER_SHEET)

    const row = new Array(header.length).fill('')
    row[dateIndex] = new Date()
    row[engineerIndex] = fio
    row[badgeIndex] = badgeContent

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) {
        throw new Error('busy')
    }

    try {
        assertBadgeNotRecorded_(sheet, badgeContent, HANDOVER_SHEET)
        sheet.appendRow(row)
    } finally {
        lock.releaseLock()
    }
}

/**
 * Бирки, сданные сегодня — для экрана «Сдачи». fio опционален для менеджера.
 */
function getHandedOverBadgesToday_(fio) {
    const sheet = getOrCreateHandoverSheet_()
    const header = getSheetHeader_(sheet)

    const dateIndex = requireColumn_(header, 'Дата', HANDOVER_SHEET)
    const engineerIndex = requireColumn_(header, 'Инженер', HANDOVER_SHEET)
    const badgeIndex = requireColumn_(header, 'Бирка', HANDOVER_SHEET)

    const fioNormalized = normalizeCell_(fio)
    const todayKey = formatDateKey_(new Date())

    const values = sheet.getDataRange().getValues()
    const entries = []

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        const dateVal = row[dateIndex]

        if (fioNormalized && normalizeCell_(row[engineerIndex]) !== fioNormalized) continue
        if (!(dateVal instanceof Date) || formatDateKey_(dateVal) !== todayKey) continue

        entries.push({
            row: rowIndex + 1,
            badge: normalizeCell_(row[badgeIndex]),
            time: Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'HH:mm'),
        })
    }

    return entries
}

/**
 * Отменяет сдачу — удаляет строку из листа «Сдача».
 * TOCTOU-safe: перед удалением проверяем, что строка не сдвинулась.
 */
function undoHandover_(row, fio, badgeContent) {
    const rowNumber = Number(row)
    const sheet = getOrCreateHandoverSheet_()
    const header = getSheetHeader_(sheet)
    const engineerIndex = requireColumn_(header, 'Инженер', HANDOVER_SHEET)
    const badgeIndex = requireColumn_(header, 'Бирка', HANDOVER_SHEET)

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) {
        throw new Error('busy')
    }

    try {
        if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
            throw new Error('Строка не найдена — обновите список и попробуйте снова')
        }

        const rowValues = sheet.getRange(rowNumber, 1, 1, header.length).getValues()[0]
        const rowMatches = normalizeCell_(rowValues[engineerIndex]) === normalizeCell_(fio)
            && normalizeCell_(rowValues[badgeIndex]) === normalizeCell_(badgeContent)

        if (!rowMatches) {
            throw new Error('Строка изменилась — обновите список и попробуйте снова')
        }

        sheet.deleteRow(rowNumber)
    } finally {
        lock.releaseLock()
    }
}

/**
 * Записывает промер в лист «Промеры».
 * Столбцы: Дата, Бирка, Покрытие, Зона 1..5, Оценка, Контролер.
 * zone* — строки; пустая строка → оставить ячейку пустой.
 */
function recordMeasurement_(fio, badge, coverage, zone1, zone2, zone3, zone4, zone5) {
    const sheet = getOrCreateMeasurementSheet_()
    const header = getSheetHeader_(sheet)

    const dateIdx = requireColumn_(header, 'Дата', MEASUREMENT_SHEET)
    const badgeIdx = requireColumn_(header, 'Бирка', MEASUREMENT_SHEET)
    const coverageIdx = requireColumn_(header, 'Покрытие', MEASUREMENT_SHEET)
    const zone1Idx = requireColumn_(header, 'Зона 1', MEASUREMENT_SHEET)
    const zone2Idx = requireColumn_(header, 'Зона 2', MEASUREMENT_SHEET)
    const zone3Idx = requireColumn_(header, 'Зона 3', MEASUREMENT_SHEET)
    const zone4Idx = requireColumn_(header, 'Зона 4', MEASUREMENT_SHEET)
    const zone5Idx = requireColumn_(header, 'Зона 5', MEASUREMENT_SHEET)
    const ratingIdx = requireColumn_(header, 'Оценка', MEASUREMENT_SHEET)
    const controllerIdx = requireColumn_(header, 'Контролер', MEASUREMENT_SHEET)

    const toNum = (v) => {
        const s = String(v || '').trim()
        if (!s) return ''
        const n = parseInt(s, 10)
        return isNaN(n) ? '' : n
    }

    const z1 = toNum(zone1)
    const z2 = toNum(zone2)
    const z3 = toNum(zone3)
    const z4 = toNum(zone4)
    const z5 = toNum(zone5)

    // Пустые зоны не попадают в оценку — иначе «250/260//240/255» с дырами.
    const rating = coverage + ': ' + [z1, z2, z3, z4, z5].filter(function (z) { return z !== '' }).join('/')

    const row = new Array(header.length).fill('')
    row[dateIdx] = new Date()
    row[badgeIdx] = badge
    row[coverageIdx] = coverage
    row[zone1Idx] = z1
    row[zone2Idx] = z2
    row[zone3Idx] = z3
    row[zone4Idx] = z4
    row[zone5Idx] = z5
    row[ratingIdx] = rating
    row[controllerIdx] = fio

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) {
        throw new Error('busy')
    }

    try {
        sheet.appendRow(row)
    } finally {
        lock.releaseLock()
    }
}

/**
 * Вход по логину/паролю — сверяем с листом «Сотрудники» в отдельной
 * таблице «Доступ к серверу». Возвращает профиль сотрудника и флаги доступа.
 *
 * Новые столбцы (Площадка, доступы) опциональны — берём indexOf, при -1
 * используем дефолт «true» для флагов доступа (показываем всё, пока
 * администратор не выставил ограничения).
 */
function login_(loginValue, password) {
    const sheet = SpreadsheetApp.openById(ACCESS_SPREADSHEET_ID).getSheetByName(STAFF_SHEET)
    if (!sheet) {
        throw new Error('Не найден лист «' + STAFF_SHEET + '»')
    }

    const header = getSheetHeader_(sheet)
    const fioIndex = requireColumn_(header, 'ФИО', STAFF_SHEET)
    const loginIndex = requireColumn_(header, 'Логин', STAFF_SHEET)
    const passwordIndex = requireColumn_(header, 'Пароль', STAFF_SHEET)
    const statusIndex = requireColumn_(header, 'Статус', STAFF_SHEET)
    const departmentIndex = requireColumn_(header, 'Отдел', STAFF_SHEET)
    const positionIndex = requireColumn_(header, 'Должность', STAFF_SHEET)

    // Столбцы доступа. Fail-closed: если столбца нет (idx < 0) или значение
    // не «Да» — доступ НЕ выдаётся (см. isYes ниже). Раньше отсутствие/опечатка
    // столбца молча открывали раздел всем сотрудникам.
    // «Доступ к сдаче» в таблице пока нет — раздел «Сдача» закрыт у всех, пока
    // столбец не добавят со значением «Да» нужным людям.
    const platformIndex = header.indexOf('Площадка')
    const roleIndex = header.indexOf('Роль')
    const accessBadgesIndex = header.indexOf('Доступ к биркам')
    const accessMeasurementsIndex = header.indexOf('Доступ к промерам')
    const accessPackingIndex = header.indexOf('Доступ к упаковкам')
    const accessHandoverIndex = header.indexOf('Доступ к сдаче')
    const accessReportsIndex = header.indexOf('Доступ к отчетам')
    // Заголовок в таблице «Доступ к серверу» — «Право согласования» (без «на»).
    // Раньше indexOf не находил → -1 → доступ по дефолту открывался всем.
    const accessApprovalsIndex = header.indexOf('Право согласования')
    const accessSupplyIndex = header.indexOf('Заказ снабжения')
    const accessOrdersIndex = header.indexOf('Работа со снабжением')
    const accessWarehouseIndex = header.indexOf('Доступ к складу')
    const accessPersonnelIndex = header.indexOf('Управление кадрами')

    const loginNormalized = normalizeCell_(loginValue).toLowerCase()
    const values = sheet.getDataRange().getValues()

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        if (normalizeCell_(row[loginIndex]).toLowerCase() !== loginNormalized) continue
        if (normalizeCell_(row[passwordIndex]) !== password) continue

        if (normalizeCell_(row[statusIndex]) !== ACTIVE_STATUS) {
            throw new Error('Учётная запись отключена — обратитесь к руководителю')
        }

        const isYes = (idx) => idx < 0 ? false : normalizeCell_(row[idx]).toLowerCase() === 'да'
        const strAt = (idx) => idx >= 0 ? normalizeCell_(row[idx]) : ''

        return {
            fio: normalizeCell_(row[fioIndex]),
            department: normalizeCell_(row[departmentIndex]),
            position: normalizeCell_(row[positionIndex]),
            platform: strAt(platformIndex),
            role: strAt(roleIndex),
            login: normalizeCell_(row[loginIndex]),
            password: normalizeCell_(row[passwordIndex]),
            access: {
                badges: isYes(accessBadgesIndex),
                measurements: isYes(accessMeasurementsIndex),
                packing: isYes(accessPackingIndex),
                handover: isYes(accessHandoverIndex),
                reports: isYes(accessReportsIndex),
                approvals: isYes(accessApprovalsIndex),
                supply: isYes(accessSupplyIndex),
                orders: isYes(accessOrdersIndex),
                warehouse: isYes(accessWarehouseIndex),
                personnel: isYes(accessPersonnelIndex),
            },
        }
    }

    throw new Error('Неверный логин или пароль')
}

function getStaffSchema_(sheet) {
    const header = getSheetHeader_(sheet)
    return {
        header: header,
        fioIndex: requireColumn_(header, 'ФИО', STAFF_SHEET),
        departmentIndex: requireColumn_(header, 'Отдел', STAFF_SHEET),
        positionIndex: requireColumn_(header, 'Должность', STAFF_SHEET),
        platformIndex: requireColumn_(header, 'Площадка', STAFF_SHEET),
        roleIndex: requireColumn_(header, 'Роль', STAFF_SHEET),
        loginIndex: requireColumn_(header, 'Логин', STAFF_SHEET),
        passwordIndex: requireColumn_(header, 'Пароль', STAFF_SHEET),
        statusIndex: requireColumn_(header, 'Статус', STAFF_SHEET),
        personnelAccessIndex: requireColumn_(header, 'Управление кадрами', STAFF_SHEET),
        rightsHeaders: header.slice(PERSONNEL_RIGHTS_START_INDEX),
    }
}

function requirePersonnelActor_(loginValue, password) {
    const sheet = SpreadsheetApp.openById(ACCESS_SPREADSHEET_ID).getSheetByName(STAFF_SHEET)
    if (!sheet) throw new Error('Не найден лист «' + STAFF_SHEET + '»')

    const schema = getStaffSchema_(sheet)
    const loginNormalized = normalizeCell_(loginValue).toLowerCase()
    const values = sheet.getDataRange().getValues()

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        if (normalizeCell_(row[schema.loginIndex]).toLowerCase() !== loginNormalized) continue
        if (normalizeCell_(row[schema.passwordIndex]) !== password) continue
        if (normalizeCell_(row[schema.statusIndex]) !== ACTIVE_STATUS) {
            throw new Error('Учётная запись отключена — обратитесь к руководителю')
        }
        if (normalizeCell_(row[schema.personnelAccessIndex]).toLowerCase() !== 'да') {
            throw new Error('Нет доступа к управлению кадрами')
        }
        return {sheet: sheet, schema: schema}
    }

    throw new Error('Неверный логин или пароль')
}

function personnelDepartments_(context) {
    const values = context.sheet.getDataRange().getValues()
    const counts = {}
    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        const department = normalizeCell_(row[context.schema.departmentIndex])
        if (!department || normalizeCell_(row[context.schema.statusIndex]) !== ACTIVE_STATUS) continue
        counts[department] = (counts[department] || 0) + 1
    }
    return Object.keys(counts).map((department) => ({department: department, activeCount: counts[department]}))
}

function personnelRights_(context) {
    return context.schema.rightsHeaders.filter((name) => Boolean(name)).map((name) => ({name: name, value: 'Нет'}))
}

function personnelPlatforms_() {
    const sheet = SpreadsheetApp.openById(ACCESS_SPREADSHEET_ID).getSheetByName('Площадки')
    if (!sheet) throw new Error('Не найден лист «Площадки»')
    const values = sheet.getDataRange().getValues()
    const found = {}
    const platforms = []
    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < values[rowIndex].length; columnIndex += 1) {
            const value = normalizeCell_(values[rowIndex][columnIndex])
            if (!value || found[value]) continue
            found[value] = true
            platforms.push(value)
        }
    }
    return platforms
}

function personnelEmployees_(context, departmentValue) {
    const department = normalizeCell_(departmentValue)
    const values = context.sheet.getDataRange().getValues()
    const employees = []
    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        if (normalizeCell_(row[context.schema.departmentIndex]) !== department) continue
        if (normalizeCell_(row[context.schema.statusIndex]) !== ACTIVE_STATUS) continue
        employees.push({
            row: rowIndex + 1,
            fio: normalizeCell_(row[context.schema.fioIndex]),
            position: normalizeCell_(row[context.schema.positionIndex]),
        })
    }
    return employees
}

function personnelEmployee_(context, rowNumber, fio) {
    const row = requirePersonnelRow_(context, rowNumber, fio)
    const rights = []
    for (let index = PERSONNEL_RIGHTS_START_INDEX; index < context.schema.header.length; index += 1) {
        const name = context.schema.header[index]
        if (!name) continue
        rights.push({name: name, value: normalizeCell_(row[index]).toLowerCase() === 'да' ? 'Да' : 'Нет'})
    }
    return {
        row: Number(rowNumber),
        fio: normalizeCell_(row[context.schema.fioIndex]),
        department: normalizeCell_(row[context.schema.departmentIndex]),
        position: normalizeCell_(row[context.schema.positionIndex]),
        platform: normalizeCell_(row[context.schema.platformIndex]),
        role: normalizeCell_(row[context.schema.roleIndex]),
        login: normalizeCell_(row[context.schema.loginIndex]),
        password: normalizeCell_(row[context.schema.passwordIndex]),
        status: normalizeCell_(row[context.schema.statusIndex]),
        rights: rights,
    }
}

function requirePersonnelRow_(context, rowNumber, fio) {
    const row = Number(rowNumber)
    if (!Number.isInteger(row) || row < 2 || row > context.sheet.getLastRow()) throw new Error('Сотрудник не найден')
    const values = context.sheet.getRange(row, 1, 1, context.schema.header.length).getValues()
    const employee = values[0]
    if (normalizeCell_(employee[context.schema.fioIndex]) !== normalizeCell_(fio)) throw new Error('Данные сотрудника изменились — обновите список')
    return employee
}

function ensurePersonnelLoginUnique_(context, login, ownRow) {
    const normalized = normalizeCell_(login).toLowerCase()
    if (!normalized) throw new Error('Укажите логин')
    const values = context.sheet.getDataRange().getValues()
    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        if (rowIndex + 1 === ownRow) continue
        if (normalizeCell_(values[rowIndex][context.schema.loginIndex]).toLowerCase() === normalized) {
            throw new Error('Такой логин уже существует')
        }
    }
}

function setPersonnelValue_(sheet, row, columnIndex, value) {
    sheet.getRange(row, columnIndex + 1).setValue(toSheetLiteral_(value))
}

function writePersonnelRights_(context, row, rights) {
    const values = rights && typeof rights === 'object' ? rights : {}
    for (let index = PERSONNEL_RIGHTS_START_INDEX; index < context.schema.header.length; index += 1) {
        const name = context.schema.header[index]
        if (!name || !Object.prototype.hasOwnProperty.call(values, name)) continue
        setPersonnelValue_(context.sheet, row, index, normalizeCell_(values[name]).toLowerCase() === 'да' ? 'Да' : 'Нет')
    }
}

function savePersonnelEmployee_(context, payload) {
    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) throw new Error('busy')
    try {
        const row = Number(payload.row)
        requirePersonnelRow_(context, row, payload.fio || '')
        ensurePersonnelLoginUnique_(context, payload.login || '', row)
        setPersonnelValue_(context.sheet, row, context.schema.platformIndex, normalizeCell_(payload.platform))
        setPersonnelValue_(context.sheet, row, context.schema.roleIndex, normalizePersonnelRole_(payload.role))
        setPersonnelValue_(context.sheet, row, context.schema.loginIndex, normalizeCell_(payload.login))
        const password = normalizeCell_(payload.password)
        if (password && !isPersonnelPassword_(password)) {
            throw new Error('Пароль должен содержать 10 латинских букв и цифр, включая строчную, прописную букву и цифру')
        }
        if (password) setPersonnelValue_(context.sheet, row, context.schema.passwordIndex, password)
        writePersonnelRights_(context, row, payload.rights)
        return personnelEmployee_(context, row, payload.fio || '')
    } finally {
        lock.releaseLock()
    }
}

function createPersonnelEmployee_(context, payload) {
    const fio = normalizeCell_(payload.fio)
    const department = normalizeCell_(payload.department)
    const position = normalizeCell_(payload.position)
    if (!fio || !department || !position) throw new Error('Заполните ФИО, отдел и должность')

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) throw new Error('busy')
    try {
        ensurePersonnelLoginUnique_(context, payload.login || '', 0)
        const row = new Array(context.schema.header.length).fill('')
        row[context.schema.fioIndex] = toSheetLiteral_(fio)
        row[context.schema.departmentIndex] = toSheetLiteral_(department)
        row[context.schema.positionIndex] = toSheetLiteral_(position)
        row[context.schema.platformIndex] = toSheetLiteral_(normalizeCell_(payload.platform))
        row[context.schema.roleIndex] = toSheetLiteral_(normalizePersonnelRole_(payload.role))
        row[context.schema.loginIndex] = toSheetLiteral_(normalizeCell_(payload.login))
        row[context.schema.passwordIndex] = toSheetLiteral_(generatePersonnelPassword_())
        row[context.schema.statusIndex] = toSheetLiteral_(ACTIVE_STATUS)
        for (let index = PERSONNEL_RIGHTS_START_INDEX; index < context.schema.header.length; index += 1) {
            const name = context.schema.header[index]
            if (!name || !payload.rights || !Object.prototype.hasOwnProperty.call(payload.rights, name)) continue
            row[index] = toSheetLiteral_(normalizeCell_(payload.rights[name]).toLowerCase() === 'да' ? 'Да' : 'Нет')
        }
        context.sheet.appendRow(row)
        return personnelEmployee_(context, context.sheet.getLastRow(), fio)
    } finally {
        lock.releaseLock()
    }
}

function dismissPersonnelEmployee_(context, rowNumber, fio) {
    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) throw new Error('busy')
    try {
        const row = Number(rowNumber)
        requirePersonnelRow_(context, row, fio)
        setPersonnelValue_(context.sheet, row, context.schema.statusIndex, 'Уволен')
    } finally {
        lock.releaseLock()
    }
}

function normalizePersonnelRole_(value) {
    const role = normalizeCell_(value)
    if (role !== 'Исполнитель' && role !== 'Менеджер') throw new Error('Выберите роль')
    return role
}

function generatePersonnelPassword_() {
    const lower = 'abcdefghijklmnopqrstuvwxyz'
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const digits = '0123456789'
    const alphabet = lower + upper + digits
    const chars = [lower.charAt(Math.floor(Math.random() * lower.length)), upper.charAt(Math.floor(Math.random() * upper.length)), digits.charAt(Math.floor(Math.random() * digits.length))]
    while (chars.length < 10) chars.push(alphabet.charAt(Math.floor(Math.random() * alphabet.length)))
    for (let index = chars.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1))
        const value = chars[index]
        chars[index] = chars[target]
        chars[target] = value
    }
    return chars.join('')
}

function isPersonnelPassword_(value) {
    return /^[A-Za-z0-9]{10}$/.test(value) && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value)
}

function getJournalSheet_() {
    const sheet = getSpreadsheet_().getSheetByName(JOURNAL_SHEET)
    if (!sheet) {
        throw new Error('Sheet not found: ' + JOURNAL_SHEET)
    }
    return sheet
}

function getOrCreateHandoverSheet_() {
    const spreadsheet = getSpreadsheet_()
    let sheet = spreadsheet.getSheetByName(HANDOVER_SHEET)

    if (!sheet) {
        sheet = spreadsheet.insertSheet(HANDOVER_SHEET)
        sheet.appendRow(['Дата', 'Инженер', 'Бирка'])
    }

    return sheet
}

function getOrCreateMeasurementSheet_() {
    const spreadsheet = getSpreadsheet_()
    let sheet = spreadsheet.getSheetByName(MEASUREMENT_SHEET)

    if (!sheet) {
        sheet = spreadsheet.insertSheet(MEASUREMENT_SHEET)
        // Заголовки как в реальном листе «Промеры» (включая «Титул и марка»),
        // чтобы пересозданный лист совпадал по структуре с оригиналом.
        sheet.appendRow(['Дата', 'Бирка', 'Титул и марка', 'Покрытие', 'Зона 1', 'Зона 2', 'Зона 3', 'Зона 4', 'Зона 5', 'Оценка', 'Контролер'])
    }

    return sheet
}

/**
 * Заголовок листа почти никогда не меняется — кешируем на 5 минут вместо
 * сетевого Sheets-чтения на каждую выдачу/упаковку/удаление. Если столбцы
 * только что переставили вручную, ошибка «столбец не найден» может на
 * несколько минут отставать от факта — это приемлемо для редкой ручной
 * правки структуры листа.
 */
function getSheetHeader_(sheet) {
    const cache = CacheService.getScriptCache()
    const cacheKey = 'header:' + sheet.getParent().getId() + ':' + sheet.getName()
    const cached = cache.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizeCell_)
    cache.put(cacheKey, JSON.stringify(header), 300)
    return header
}

function requireColumn_(header, columnName, sheetName) {
    const index = header.indexOf(columnName)
    if (index < 0) {
        // Перечисляем то, что на листе есть на самом деле: без этого «не
        // найден столбец» отправляет искать вслепую, а расхождение обычно в
        // одном слове или лишнем пробеле.
        throw new Error('Не найден столбец «' + columnName + '» на листе «' + sheetName
            + '». Есть: ' + header.filter(function (name) { return name !== '' }).join(', '))
    }
    return index
}

/**
 * Записывает считанный QR упаковки на лист «Логисты». Лист создаётся
 * автоматически при первом вызове, если его ещё нет в таблице.
 *
 * «Цех» заполняется площадкой из профиля сотрудника (platform), а не
 * выбором цеха на отдельном экране — выбор цеха для упаковки убран.
 * «Вес»/«Титул»/«Титул и марка» ничего не пишут — на реальном листе
 * это готовые Arrayformula-колонки, считающие значения из «Бирка»
 * автоматически при появлении новой строки.
 */
function recordPacking_(platform, fio, machine, qrText) {
    const sheet = getOrCreateLogistSheet_()

    const lock = LockService.getScriptLock()
    if (!lock.tryLock(5000)) {
        throw new Error('busy')
    }

    try {
        assertBadgeNotRecorded_(sheet, qrText, LOGIST_SHEET)
        const row = buildLogistRow_(sheet, platform, fio, machine, qrText)
        sheet.appendRow(row)
    } finally {
        lock.releaseLock()
    }
}

function buildLogistRow_(sheet, platform, fio, machine, qrText) {
    const header = getSheetHeader_(sheet)

    const dateIndex = requireColumn_(header, 'Дата', LOGIST_SHEET)
    const workshopIndex = requireColumn_(header, 'Цех', LOGIST_SHEET)
    const fioIndex = requireColumn_(header, 'ФИО', LOGIST_SHEET)
    const badgeIndex = requireColumn_(header, 'Бирка', LOGIST_SHEET)
    const machineIndex = requireColumn_(header, 'Машина', LOGIST_SHEET)

    const row = new Array(header.length).fill('')
    row[dateIndex] = new Date()
    row[workshopIndex] = platform
    row[fioIndex] = fio
    row[badgeIndex] = qrText
    row[machineIndex] = machine

    return row
}

/**
 * Список упаковок сотрудника за сегодня на конкретную машину — для
 * таблицы на экране «Упаковка» (сколько уже загружено на эту машину).
 */
function getPackingToday_(fio, machine) {
    const sheet = getOrCreateLogistSheet_()
    const header = getSheetHeader_(sheet)

    const dateIndex = requireColumn_(header, 'Дата', LOGIST_SHEET)
    const fioIndex = requireColumn_(header, 'ФИО', LOGIST_SHEET)
    const weightIndex = requireColumn_(header, 'Вес', LOGIST_SHEET)
    const titleMarkIndex = requireColumn_(header, 'Титул и марка', LOGIST_SHEET)
    const machineIndex = requireColumn_(header, 'Машина', LOGIST_SHEET)

    const fioNormalized = normalizeCell_(fio)
    const machineNormalized = normalizeCell_(machine)
    const todayKey = formatDateKey_(new Date())

    const values = sheet.getDataRange().getValues()
    const entries = []

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        const row = values[rowIndex]
        const rowDate = row[dateIndex]

        if (normalizeCell_(row[fioIndex]) !== fioNormalized) continue
        if (normalizeCell_(row[machineIndex]) !== machineNormalized) continue
        if (!(rowDate instanceof Date) || formatDateKey_(rowDate) !== todayKey) continue

        entries.push({
            titleAndMark: normalizeCell_(row[titleMarkIndex]),
            weight: Number(row[weightIndex]) || 0,
        })
    }

    return entries
}

function getOrCreateLogistSheet_() {
    const spreadsheet = getSpreadsheet_()
    let sheet = spreadsheet.getSheetByName(LOGIST_SHEET)

    if (!sheet) {
        sheet = spreadsheet.insertSheet(LOGIST_SHEET)
        // Заголовки как в реальном листе «Логисты» (включая «Титул», «Титул и
        // марка», «Машина») — иначе пересозданный лист был бы урезан.
        sheet.appendRow(['Дата', 'Цех', 'ФИО', 'Накладная', 'Бирка', 'Вес', 'Титул', 'Титул и марка', 'Машина'])
    }

    return sheet
}

/**
 * Упаковка и сдача — одна бирка не должна попасть в таблицу дважды.
 * Проверяем только столбец «Бирка» на целевом листе; журнал выдачи,
 * промеры и прочие записи не затрагиваем.
 */
function assertBadgeNotRecorded_(sheet, badgeContent, sheetName) {
    const normalized = normalizeCell_(badgeContent)
    if (!normalized) return

    const header = getSheetHeader_(sheet)
    const badgeIndex = requireColumn_(header, 'Бирка', sheetName)
    const values = sheet.getDataRange().getValues()

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
        if (normalizeCell_(values[rowIndex][badgeIndex]) === normalized) {
            throw new Error('Бирка уже записана')
        }
    }
}

function formatDateKey_(date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')
}

function normalizeCell_(value) {
    return String(value == null ? '' : value).trim()
}

function toSheetLiteral_(value) {
    const text = String(value == null ? '' : value)
    return /^[=+\-@]/.test(text) ? "'" + text : text
}

function jsonResponse_(payload) {
    return ContentService
        .createTextOutput(JSON.stringify(payload))
        .setMimeType(ContentService.MimeType.JSON)
}
