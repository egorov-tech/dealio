import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const gas = await readFile(new URL('../scripts/erp-gas-webapp.js', import.meta.url), 'utf8')
const api = await readFile(new URL('../app/utils/erp-api.ts', import.meta.url), 'utf8')
const reports = await readFile(new URL('../public/api/src/Reports.php', import.meta.url), 'utf8')
const hub = await readFile(new URL('../app/pages/reports.vue', import.meta.url), 'utf8')
const page = await readFile(new URL('../app/pages/reports-month.vue', import.meta.url), 'utf8')
const fullPage = await readFile(new URL('../app/pages/reports-full.vue', import.meta.url), 'utf8')
const ksPage = await readFile(new URL('../app/pages/reports-ks.vue', import.meta.url), 'utf8')
const idPage = await readFile(new URL('../app/pages/reports-id.vue', import.meta.url), 'utf8')
const statusBadge = await readFile(new URL('../app/components/erp/ErpStatusBadge.vue', import.meta.url), 'utf8')
const summary = await readFile(new URL('../app/components/erp/ErpReportsSummary.vue', import.meta.url), 'utf8').catch(() => '')
const table = await readFile(new URL('../app/components/erp/ErpReportsTable.vue', import.meta.url), 'utf8').catch(() => '')
const grouping = await readFile(new URL('../app/utils/erp-report-grouping.ts', import.meta.url), 'utf8')
const ksIdGrouping = await readFile(new URL('../app/utils/erp-ks-id-grouping.ts', import.meta.url), 'utf8')
const router = await readFile(new URL('../public/api/src/Router.php', import.meta.url), 'utf8')
const indexPhp = await readFile(new URL('../public/api/index.php', import.meta.url), 'utf8')
const sections = await readFile(new URL('../app/utils/erp-sections.ts', import.meta.url), 'utf8')
const middleware = await readFile(new URL('../app/middleware/erp-flow.global.ts', import.meta.url), 'utf8')

test('GAS exposes a token-protected read-only reports bridge with exact columns', () => {
  assert.match(gas, /action === 'reportsCurrent'/)
  assert.match(gas, /REPORTS_BRIDGE_TOKEN/)
  assert.match(gas, /REPORTS_SPREADSHEET_ID/)
  assert.match(gas, /'ТП за месяц, тн'/)
  assert.match(gas, /'Отгружено за месяц, тн'/)
  assert.match(gas, /'В цехе, тн'/)
})

test('reports client uses same-origin API and exposes named units', () => {
  assert.match(api, /export async function fetchReportsCurrentViaApi/)
  assert.match(api, /reports\/current/)
  assert.match(api, /productionRub: number/)
  assert.match(api, /shippedTons: number/)
  assert.match(api, /inWorkshopTons: number/)
})

test('reports server follows the standard Apps Script redirect without exposing the bridge to browsers', () => {
  assert.match(reports, /CURLOPT_FOLLOWLOCATION\s*=>\s*true/)
  assert.match(reports, /erp_require_user/)
  assert.match(reports, /erp_require_permission\([^\n]+['"]reports['"]/)
})

test('reports page renders all mandatory metrics with correct units and retry state', () => {
  assert.match(summary, /ТП за месяц/)
  assert.match(summary, /Отгружено/)
  assert.match(summary, /В цехе/)
  assert.match(page, /Повторить/)
  assert.match(page, /fetchCurrentReports/)
  assert.match(table, /customer/)
  assert.match(summary, /<\/style>/)
  assert.match(table, /<\/style>/)
})

test('единица измерения — в шапке блока, значение остаётся голым числом', () => {
  // Отдельного форматтера с «₽»/«т» внутри значения больше нет: единица
  // уехала в подпись метрики и в заголовок колонки.
  for (const source of [summary, table, fullPage]) {
    assert.doesNotMatch(source, /style: 'currency'/)
    assert.doesNotMatch(source, /\}\).format\(value\)\} т`/)
  }

  assert.match(summary, /label: 'ТП за месяц, ₽'/)
  assert.match(summary, /label: 'Отгружено, т'/)
  assert.match(summary, /label: 'В цехе, т'/)
  assert.match(table, /label: 'ТП за месяц, ₽'/)
  assert.match(table, /label: 'В цехе, т'/)

  // Значения выровнены по правому краю колонки на любой ширине, а не только
  // в мобильной ветке медиазапроса.
  for (const source of [table, fullPage]) {
    const metricRule = source.match(/ {2}dd\n([\s\S]*?)\n\n/)?.[1] ?? ''
    assert.match(metricRule, /text-align: right/)
  }
})

test('«Отчёт месяца»: колонка «Отгр. м²» справа от «Отгр. т», данные из колонки K', () => {
  // На листе колонка подписана «Отгружено за месяц, м2» и стоит в K.
  // Читаем по заголовку, буква из ТЗ остаётся запасным вариантом.
  assert.match(gas, /columnIndexOr_\(header, \['Отгружено за месяц, м2', 'Отгружено за месяц, м²'\], 10\)/)
  assert.match(gas, /shippedSquareMeters: reportsNumber_\(row\[shippedAreaIndex\]\)/)
  assert.match(reports, /'shippedSquareMeters' => erp_reports_number/)
  assert.match(api, /shippedSquareMeters: number/)

  // Порядок колонок в шапке: сначала тонны, следом квадратные метры.
  const head = table.match(/erp-reports-table__grid-head[\s\S]*?<\/div>/)?.[0] ?? ''
  assert.ok(head.indexOf('Отгр., т') > -1 && head.indexOf('Отгр., м²') > head.indexOf('Отгр., т'),
    '«Отгр., м²» должна стоять справа от «Отгр., т»')
  assert.match(table, /formatDecimal\(line\.shippedSquareMeters\)/)
  assert.match(table, /formatDecimal\(group\.totals\.shippedSquareMeters\)/)
})

test('раздел «Отчёты» — хаб из 4 плиток, существующий экран переехал на «Отчёт месяца»', () => {
  assert.match(hub, /to: '\/reports-month'/)
  assert.match(hub, /label: 'Месячный отчёт'/)
  assert.match(hub, /to: '\/reports-full'/)
  assert.match(hub, /label: 'Полный отчёт'/)
  assert.match(hub, /to: '\/reports-ks'/)
  assert.match(hub, /label: 'КС'/)
  assert.match(hub, /to: '\/reports-id'/)
  assert.match(hub, /label: 'ИД'/)
  // Хаб сам не ходит за данными — только 4 плитки-ссылки.
  assert.doesNotMatch(hub, /fetchCurrentReports|fetchReportsKs|fetchReportsId/)

  assert.match(sections, /routes: \['\/reports', '\/reports-month', '\/reports-full', '\/reports-ks', '\/reports-id'\]/)
  assert.match(middleware, /'\/reports-month',/)
  assert.match(middleware, /'\/reports-full',/)
  assert.match(middleware, /'\/reports-ks',/)
  assert.match(middleware, /'\/reports-id',/)
  assert.match(middleware, /'\/reports-month': 'reports'/)
  assert.match(middleware, /'\/reports-full': 'reports'/)
  assert.match(middleware, /'\/reports-ks': 'reports'/)
  assert.match(middleware, /'\/reports-id': 'reports'/)
})

test('«Полный отчёт» — тот же лист, но метрики за весь период, без сводки и «Поступило»', () => {
  // Одна и та же ручка /reports/current: лист один, дублировать запрос к
  // мосту под вторую проекцию метрик незачем.
  assert.match(fullPage, /fetchCurrentReports/)

  // Данные за весь период работы — колонки D и E, а не месячные метрики.
  assert.match(fullPage, /formatAmount\(row\.productionTotalRub\)/)
  assert.match(fullPage, /formatTons\(row\.shippedTotalTons\)/)
  assert.match(fullPage, /label: 'ТП, ₽'/)
  assert.doesNotMatch(fullPage, /'ТП за месяц/)
  assert.doesNotMatch(fullPage, /'В цехе/)

  // «Поступило» из раздела убрано целиком — от экрана до моста. В самом
  // источнике колонка поступления есть и стоит вплотную к отгрузке, так
  // что в GAS о ней говорит только комментарий — но не поле данных.
  assert.doesNotMatch(fullPage, /Поступило|received/i)
  for (const source of [reports, api, grouping]) {
    assert.doesNotMatch(source, /received/i)
  }
  assert.doesNotMatch(gas, /receivedTons/)

  // Блока сводных данных в разделе нет — ни разметки, ни стилей.
  assert.doesNotMatch(fullPage, /full-report-summary/)
  assert.doesNotMatch(fullPage, /summaryMetrics/)

  // Та же группировка (Договор/Площадка/Заказчик), что у «Отчёта месяца».
  assert.match(fullPage, /groupReportRows/)
  assert.match(fullPage, /MODE_OPTIONS/)
})

test('за весь период берутся «ТП, руб» и «Отгружено, тн», а не соседняя колонка поступления', () => {
  // Буква E из ТЗ указывает на «Поступило, тн» — отгрузка за период лежит
  // в F. Показывать поступление под видом отгрузки нельзя тем более, что
  // по тому же ТЗ поступление в этом разделе видеть не хотят.
  assert.match(gas, /columnIndexOr_\(header, \['ТП, руб'\], 3\)/)
  assert.match(gas, /columnIndexOr_\(header, \['Отгружено, тн'\], 5\)/)
  assert.match(gas, /productionTotalRub: reportsNumber_\(row\[productionTotalIndex\]\)/)
  assert.match(gas, /shippedTotalTons: reportsNumber_\(row\[shippedTotalIndex\]\)/)

  assert.match(reports, /'productionTotalRub' => erp_reports_number/)
  assert.match(reports, /'shippedTotalTons' => erp_reports_number/)
  assert.match(api, /productionTotalRub: number/)
  assert.match(api, /shippedTotalTons: number/)
})

test('сводка считает только месячные метрики — месяц и весь период не складываются', () => {
  const payload = reports.slice(reports.indexOf('function erp_reports_payload'))
  const summaryBlock = payload.slice(0, payload.indexOf('$timezone'))
  assert.match(summaryBlock, /'productionRub' => 0\.0/)
  assert.doesNotMatch(summaryBlock, /productionTotalRub|shippedTotalTons/)
})

test('КС и ИД — свои GAS-действия, свои PHP-маршруты, право reports', () => {
  assert.match(gas, /action === 'reportsKs'/)
  assert.match(gas, /action === 'reportsId'/)
  assert.match(gas, /function reportsKs_\(token\)/)
  assert.match(gas, /function reportsId_\(token\)/)

  assert.match(router, /\$path === '\/reports\/ks'/)
  assert.match(router, /\$path === '\/reports\/id'/)
  assert.match(indexPhp, /erp_reports_ks_current\(\$pdo, \$config, \$requestId\)/)
  assert.match(indexPhp, /erp_reports_id_current\(\$pdo, \$config, \$requestId\)/)

  for (const handler of ['erp_reports_ks_current', 'erp_reports_id_current']) {
    const start = reports.indexOf(`function ${handler}(`)
    assert.ok(start > -1, `${handler} не найден`)
    const body = reports.slice(start, reports.indexOf('\n}\n', start) + 3)
    assert.match(body, /erp_require_permission\(\$pdo, \$actor, 'reports', \$requestId\)/)
  }
})

test('КС: источник — erp_pto_ks, а не Google-таблица; шапка «КС», «Итого»', () => {
  // Раздел «ПТО» ведёт эти данные сам (erp_pto_ks) — до отчётов они
  // доезжают прямым SQL-запросом, без сетевого моста и его отказов.
  const handler = reports.slice(reports.indexOf('function erp_reports_ks_current('))
  const body = handler.slice(0, handler.indexOf('\n}\n'))
  assert.match(body, /FROM erp_pto_ks k/)
  assert.match(body, /LEFT JOIN erp_contracts c ON c\.internal_number = k\.contract_internal_number/)
  assert.match(body, /array_map\('erp_reports_ks_row', \$rows\)/)
  assert.doesNotMatch(body, /erp_reports_fetch_bridge/)

  const row = reports.slice(reports.indexOf('function erp_reports_ks_row('))
  const rowBody = row.slice(0, row.indexOf('\n}\n'))
  assert.match(rowBody, /erp_reports_contract_label\(\$row\)/)
  assert.match(rowBody, /erp_reports_clean_text\(\$row\['status'\] \?\? ''\)/)

  assert.match(api, /export interface ErpKsRow/)
  assert.match(ksPage, /groupKsByContract/)
  assert.match(ksPage, /Итого/)
  assert.match(ksPage, /<span role="columnheader">КС<\/span>/)
})

test('ИД: источник — erp_pto_ed; площадь = «Объём» карточки ПТО, без «Итого»', () => {
  const handler = reports.slice(reports.indexOf('function erp_reports_id_current('))
  const body = handler.slice(0, handler.indexOf('\n}\n'))
  assert.match(body, /FROM erp_pto_ed e/)
  assert.match(body, /LEFT JOIN erp_contracts c ON c\.internal_number = e\.contract_internal_number/)
  assert.match(body, /array_map\('erp_reports_id_row', \$rows\)/)

  const row = reports.slice(reports.indexOf('function erp_reports_id_row('))
  const rowBody = row.slice(0, row.indexOf('\n}\n'))
  // «Площадь» в отчёте — тот же столбец, что «Объём» на карточке ИД раздела
  // «ПТО», не отдельная колонка: у erp_pto_ed своего поля area нет.
  assert.match(rowBody, /'area' => \$row\['volume'\] !== null \? \(float\) \$row\['volume'\] : 0\.0/)

  assert.match(api, /export interface ErpIdRow/)
  assert.match(api, /area: number/)
  assert.match(idPage, /groupIdByContract/)
  // Внутри договора — строки статусов, а не поштучные акты: их под четыре
  // сотни на всю базу, показывать поштучно бессмысленно.
  assert.match(ksIdGrouping, /existing\.status === row\.status/)
  assert.match(ksIdGrouping, /line\.area \+= row\.area/)
  assert.match(ksIdGrouping, /line\.amountWithVat \+= row\.amountWithVat/)
  assert.match(idPage, /<span role="columnheader">Площадь<\/span>/)
  assert.match(idPage, /<span role="columnheader">Стоимость с НДС<\/span>/)
  // Итоговой строки в ИД по ТЗ нет — только строки статусов.
  assert.doesNotMatch(idPage, /Итого/)
})

test('КС/ИД: договор группируется по человекочитаемой метке — номер плюс заказчик', () => {
  // Таблицы ПТО хранят только внутренний номер договора, а не готовую
  // подпись, как раньше был лист Google — «274» без контекста в шапке
  // карточки был бы шагом назад для менеджера, который номера не помнит.
  const label = reports.slice(reports.indexOf('function erp_reports_contract_label('))
  const body = label.slice(0, label.indexOf('\n}\n'))
  assert.match(body, /\$customer !== '' \? "\{\$internal\} · \{\$customer\}" : \$internal/)
})

test('невидимый хвост из выгрузки не превращает статус в кашу на экране отчётов', () => {
  // Тот же класс бага, что уже чинили в разделе «ПТО» (см. erp_pto_clean в
  // Pto.php) — Reports.php своя копия, потому что не зависит от Pto.php.
  assert.match(reports, /function erp_reports_clean_text/)
  for (const fn of ['erp_reports_ks_row', 'erp_reports_id_row']) {
    const body = reports.slice(reports.indexOf(`function ${fn}(`))
    assert.match(body.slice(0, body.indexOf('\n}\n')), /erp_reports_clean_text/)
  }
})

test('плашка статуса — палитра из ТЗ, контур не даёт слиться с белой карточкой', () => {
  for (const [status, fill] of [
    ['Устранение замечаний', '#fff2cc'],
    ['На проверке ГСП', '#d9e1f2'],
    ['На проверке СК', '#d9e1f2'],
    ['Не хватает Инспекций', '#fff2cc'],
    ['Не хватает АВК', '#fff2cc'],
    ['Согласована', '#e2efda'],
    ['Подписана', '#a9d08e'],
    ['Нет ПОЗ', '#ed7d31'],
    ['Подготовка', '#fff2cc'],
  ]) {
    const tone = statusBadge.match(new RegExp(`'${status}': '(\\w+)'`))
    assert.ok(tone, `статусу «${status}» не назначен тон`)
    // Каждый блок «&--tone» кончается ровно перед следующим «&--» или
    // закрывающим тегом стиля — так же надёжно, как искать по границе
    // объявления, но без риска зацепить произвольную длину блока.
    const ruleMatch = statusBadge.match(new RegExp(`&--${tone[1]}\\n(?:.*\\n)*?(?=\\n  &--|\\n<\\/style>)`))
    assert.ok(ruleMatch, `нет CSS-блока для тона «${tone[1]}»`)
    assert.ok(ruleMatch[0].includes(`background: ${fill}`), `«${status}» должен заливаться ${fill}`)
    assert.match(ruleMatch[0], /border: 1px solid #/)
  }

  // Тёмные чернила держат контраст на самой насыщенной заливке (#ed7d31):
  // белый текст на ней даёт 2,8:1 и нечитаем.
  assert.match(statusBadge, /color: #16202e/)

  // Статус вне палитры ТЗ («На согласовании» у КС, «Забрал ВЛС»/«Гарантийный
  // объём» у ИД — реальные значения в базе) получает нейтральный тон, а не
  // остаётся без цвета.
  assert.match(statusBadge, /STATUS_TONE\[props\.status\] \?\? 'neutral'/)
  assert.match(statusBadge, /&--neutral[\s\S]{0,80}border: 1px solid/)

  assert.match(idPage, /<ErpStatusBadge :status="line\.status"\/>/)
  assert.match(ksPage, /<ErpStatusBadge :status="line\.status"\/>/)
})

test('лист без шапки не теряет первую строку при чтении по буквам', () => {
  // Читая по заголовкам, первую строку пропускаешь всегда. По буквам это
  // уже не гарантия: пропущенная строка молча испортила бы «Итого».
  assert.match(gas, /function firstDataRowIndex_/)
  // Шапка вида «2024» в денежной колонке — тоже число, поэтому сначала
  // ищем знакомое слово шапки и только потом смотрим на число.
  assert.match(gas, /const REPORTS_HEADER_WORDS = \[/)
  const detector = gas.slice(gas.indexOf('function firstDataRowIndex_'))
  const body = detector.slice(0, detector.indexOf('\n}\n'))
  assert.ok(body.indexOf('REPORTS_HEADER_WORDS') < body.indexOf('isNumericCell_'),
    'слово шапки должно проверяться раньше числа')
  for (const fn of ['normalizeKsRows_', 'normalizeIdRows_']) {
    const body = gas.slice(gas.indexOf(`function ${fn}`))
    assert.match(body.slice(0, body.indexOf('\n}\n')), /firstDataRowIndex_\(values, amountIndex\)/)
  }
})

test('«не вижу данные» диагностируется: лист ищется устойчиво, причина доезжает до экрана', () => {
  // Имя вкладки в ТЗ — «Лист 15», в настройках скрипта — «Лист15»: один
  // пробел роняет весь раздел, а снаружи это выглядит как пустые отчёты.
  assert.match(gas, /function requireReportsSheet_/)
  assert.match(gas, /function sheetKey_/)
  assert.match(gas, /Не найден лист отчётов «' \+ sheetName \+ '». Есть: /)
  for (const constant of ['REPORTS_SHEET_NAME', 'REPORTS_KS_SHEET_NAME', 'REPORTS_ID_SHEET_NAME']) {
    assert.match(gas, new RegExp(`requireReportsSheet_\\(${constant}\\)`))
  }
  assert.doesNotMatch(gas, /getSheetByName\(REPORTS_(KS_|ID_)?SHEET_NAME\)/)

  // Пустое свойство и неверный токен — разные поломки, чинятся в разных
  // местах, поэтому и сообщения разные.
  assert.match(gas, /Не настроен токен отчётов \(Script Property REPORTS_BRIDGE_TOKEN\)/)
  assert.match(gas, /Не настроен источник отчётов \(Script Property REPORTS_SPREADSHEET_ID\)/)

  // «Не найден столбец» перечисляет то, что на листе есть на самом деле.
  assert.match(gas, /Не найден столбец[\s\S]{0,120}Есть: /)

  // Мост не стирает причину, и она доходит до экрана.
  assert.match(reports, /function erp_reports_bridge_data/)
  assert.match(reports, /\$payload\['error'\]/)
  assert.match(reports, /function erp_reports_failure_message/)
  assert.match(reports, /erp_error_payload\('reports_unavailable', erp_reports_failure_message\(\$error\), \$requestId\)/)
})

test('холодный старт источника не обрывается таймаутом на середине', () => {
  // Apps Script будит проект и открывает таблицу секунд двадцать — это
  // касается только «Отчёта месяца»/«Полного отчёта» (Лист15), КС и ИД с
  // моста больше не читаются и своего таймаута не держат.
  assert.match(api, /const ERP_REPORTS_TIMEOUT_MS = 50_000/)
  assert.match(api, /'reports\/current', \{timeoutMs: ERP_REPORTS_TIMEOUT_MS\}/)
  for (const route of ['reports\\/ks', 'reports\\/id']) {
    assert.doesNotMatch(api, new RegExp(`'${route}', \\{timeoutMs: ERP_REPORTS_TIMEOUT_MS\\}`))
  }
  assert.match(reports, /CURLOPT_CONNECTTIMEOUT => 10/)
  assert.match(reports, /CURLOPT_TIMEOUT => 45/)
})
