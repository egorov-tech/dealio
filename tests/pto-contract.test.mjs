import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../public/api/migrations/024_erp_pto_own_tables.sql', import.meta.url), 'utf8')
const php = await readFile(new URL('../public/api/src/Pto.php', import.meta.url), 'utf8')
const auth = await readFile(new URL('../public/api/src/Auth.php', import.meta.url), 'utf8')
const personnel = await readFile(new URL('../public/api/src/Personnel.php', import.meta.url), 'utf8')
const router = await readFile(new URL('../public/api/src/Router.php', import.meta.url), 'utf8')
const indexPhp = await readFile(new URL('../public/api/index.php', import.meta.url), 'utf8')
const bootstrap = await readFile(new URL('../public/api/src/Bootstrap.php', import.meta.url), 'utf8')
const types = await readFile(new URL('../types/erp.types.ts', import.meta.url), 'utf8')
const sections = await readFile(new URL('../app/utils/erp-sections.ts', import.meta.url), 'utf8')
const middleware = await readFile(new URL('../app/middleware/erp-flow.global.ts', import.meta.url), 'utf8')
const api = await readFile(new URL('../app/utils/erp-pto.ts', import.meta.url), 'utf8')
const hub = await readFile(new URL('../app/pages/pto.vue', import.meta.url), 'utf8')
const edPage = await readFile(new URL('../app/pages/pto-ed.vue', import.meta.url), 'utf8')
const ksPage = await readFile(new URL('../app/pages/pto-ks.vue', import.meta.url), 'utf8')
const wrPage = await readFile(new URL('../app/pages/pto-work-statements.vue', import.meta.url), 'utf8')
const runbook = await readFile(new URL('../docs/sql-staging-deploy-runbook.md', import.meta.url), 'utf8')
const auditScript = await readFile(new URL('../scripts/staging-audit.sh', import.meta.url), 'utf8')
const cronScript = await readFile(new URL('../scripts/pto-notify-status.php', import.meta.url), 'utf8')

const functionBody = (source, name) => {
    const start = source.indexOf(`function ${name}(`)
    assert.ok(start > -1, `${name} не найдена`)
    const end = source.indexOf('\n}\n', start)
    return source.slice(start, end + 3)
}

test('раздел «ПТО» заведён во всех местах: право, раздел, маршруты, доступ', () => {
    // Право project_data уже существует (заведено под ведомость работ) — здесь
    // только раздел приложения поверх него, пропуск любого места означает
    // раздел, недоступный по прямой ссылке или невидимый в навигации.
    assert.match(auth, /'project_data'\]/)
    assert.match(personnel, /'project_data' => 'Внесение проектных данных'/)
    assert.match(types, /project_data: boolean/)
    assert.match(sections, /key: 'project_data',/)
    assert.match(sections, /routes: \['\/pto', '\/pto-ed', '\/pto-ks', '\/pto-work-statements'\]/)
    assert.match(bootstrap, /require_once __DIR__ \. '\/Pto\.php'/)

    for (const route of ['/pto', '/pto-ed', '/pto-ks', '/pto-work-statements']) {
        assert.match(middleware, new RegExp(`'${route.replace('/', '\\/')}',`))
        assert.match(middleware, new RegExp(`'${route.replace('/', '\\/')}': 'project_data'`))
    }
})

test('«ПТО» — хаб из 3 плиток: ИД, КС, ВР', () => {
    assert.match(hub, /to: '\/pto-ed'/)
    assert.match(hub, /label: 'ИД'/)
    assert.match(hub, /to: '\/pto-ks'/)
    assert.match(hub, /label: 'КС'/)
    assert.match(hub, /to: '\/pto-work-statements'/)
    assert.match(hub, /label: 'ВР'/)
})

test('маршруты ИД/КС/ВР объявлены в роутере и продиспетчерены', () => {
    for (const [routeName, handler] of [
        ["\\$path === '/pto/ed'", 'ed_list'],
        ["preg_match\\('#\\^/pto/ed/\\(\\\\d\\+\\)\\$#'", 'ed_update'],
        ["\\$path === '/pto/ks'", 'ks_list'],
        ["preg_match\\('#\\^/pto/ks/\\(\\\\d\\+\\)\\$#'", 'ks_update'],
        ["\\$path === '/pto/work-statements'", 'work_statements_list'],
        ["preg_match\\('#\\^/pto/work-statements/\\(\\\\d\\+\\)\\$#'", 'work_statement_update'],
        ["\\$path === '/pto/contracts'", 'pto_contracts'],
        ["\\$path === '/pto/rate-params'", 'pto_rate_params'],
        ["\\$path === '/internal/pto-notify-status'", 'pto_notify_status_cron'],
    ]) {
        assert.match(router, new RegExp(routeName))
        assert.match(indexPhp, new RegExp(`\\$name === '${handler}'`))
    }

    // DELETE-маршруты — отдельные проверки метода, не только пути.
    assert.match(router, /\$method === 'DELETE' && preg_match\('#\^\/pto\/ed\/\(\\d\+\)\$#'/)
    assert.match(router, /\$method === 'DELETE' && preg_match\('#\^\/pto\/ks\/\(\\d\+\)\$#'/)
    assert.match(router, /\$method === 'DELETE' && preg_match\('#\^\/pto\/work-statements\/\(\\d\+\)\$#'/)
})

test('каждая ручка ПТО проверяет право project_data, а не общее «залогинен»', () => {
    for (const handler of [
        'erp_pto_contracts', 'erp_pto_rate_params',
        'erp_ed_list', 'erp_ed_create', 'erp_ed_update', 'erp_ed_delete',
        'erp_ks_list', 'erp_ks_create', 'erp_ks_update', 'erp_ks_delete',
        'erp_work_statements_list', 'erp_work_statement_create', 'erp_work_statement_update', 'erp_work_statement_delete',
    ]) {
        const body = functionBody(php, handler)
        assert.match(body, /erp_require_permission\(\$pdo, \$actor, 'project_data', \$requestId\)/, `${handler} должна проверять project_data`)
    }
})

test('лист без шапки не теряет первую строку — таблицы ИД/КС связаны с договором RESTRICT', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS erp_pto_ed/)
    assert.match(migration, /CREATE TABLE IF NOT EXISTS erp_pto_ks/)
    for (const table of ['erp_pto_ed', 'erp_pto_ks']) {
        const start = migration.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`)
        const end = migration.indexOf(';', start)
        const body = migration.slice(start, end)
        assert.match(body, /FOREIGN KEY \(contract_internal_number\) REFERENCES erp_contracts \(internal_number\)\s+ON DELETE RESTRICT ON UPDATE CASCADE/)
        assert.match(body, /notified_status VARCHAR\(64\) NOT NULL DEFAULT ''/)
    }
    for (const column of ['aosr', 'title', 'volume', 'cost', 'status']) {
        assert.match(migration, new RegExp(`\\b${column}\\b`))
    }
    assert.match(migration, /\bnumber VARCHAR\(64\)/)
})

test('статус ИД/КС ограничен списком из ТЗ, а не свободным текстом', () => {
    assert.match(php, /const ERP_ED_STATUSES = \[/)
    assert.match(php, /const ERP_KS_STATUSES = \['Подписана', 'Согласована'\]/)
    for (const status of [
        'Устранение замечаний', 'На проверке ГСП', 'На проверке СК', 'Не хватает Инспекций',
        'Не хватает АВК', 'Согласована', 'Подписана', 'Нет ПОЗ', 'Подготовка', 'Забрал ВЛС',
        'Гарантийный объём',
    ]) {
        assert.ok(php.includes(`'${status}'`), `нет статуса «${status}» в списке ИД`)
    }

    const edInput = functionBody(php, 'erp_ed_input')
    assert.match(edInput, /in_array\(\$status, erp_ed_statuses\(\$pdo\), true\)/)
    const ksInput = functionBody(php, 'erp_ks_input')
    assert.match(ksInput, /in_array\(\$status, erp_ks_statuses\(\$pdo\), true\)/)
})

test('изменение статуса ИД/КС уведомляет ПТО — тот же diff-приём, что у заявок и счетов', () => {
    // Событие — расхождение status <> notified_status, а не вызов из
    // конкретного места: тот же приём, что erp_supply_notify_status_changes
    // и erp_approvals_notify_status_changes.
    for (const [fn, table, url] of [
        ['erp_ed_notify_status_changes', 'erp_pto_ed', "'/pto-ed'"],
        ['erp_ks_notify_status_changes', 'erp_pto_ks', "'/pto-ks'"],
    ]) {
        const body = functionBody(php, fn)
        assert.match(body, new RegExp(`FROM ${table} WHERE ' \\. ERP_PTO_STATUS_CHANGED`))
        assert.match(body, new RegExp(`UPDATE ${table} SET notified_status = :status`))
        assert.match(body, /erp_pto_user_ids\(\$pdo\)/)
        assert.match(body, /erp_push_send_to_users/)
        assert.match(body, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        // Отправка обёрнута в свой try/catch: сбой push (или вовсе не
        // настроенный push) не должен прерывать цикл до записи отметки —
        // ровно этот баг поймал живой прогон против реальной MySQL: без
        // внутреннего try/catch исключение из erp_push_send_to_users вылетало
        // из всего foreach, и $markNotified->execute() не выполнялся вовсе.
        const sendIndex = body.indexOf('erp_push_send_to_users')
        const tryIndex = body.lastIndexOf('try {', sendIndex)
        assert.ok(tryIndex > -1 && tryIndex < sendIndex, `${fn}: erp_push_send_to_users должен быть внутри try`)
        const catchIndex = body.indexOf('catch (Throwable)', sendIndex)
        assert.ok(catchIndex > -1, `${fn}: должен быть catch (Throwable) сразу после отправки`)
        // Отметку ставим даже без получателей и без успешной отправки —
        // иначе один и тот же переход слался бы бесконечно каждый крон.
        assert.match(body, /\$markNotified->execute\(\['status' => \$row\['status'\], 'id' => \$row\['id'\]\]\)/)
    }

    // Создание не должно считаться «изменением»: новая запись сразу отмечена
    // своим же статусом как уже сообщённая.
    for (const fn of ['erp_ed_create', 'erp_ks_create']) {
        const body = functionBody(php, fn)
        assert.match(body, /\['notified_status'\] = \$data\['status'\]/)
    }

    // Обновление уведомляет мгновенно, не только через крон-подстраховку.
    assert.match(functionBody(php, 'erp_ed_update'), /erp_ed_notify_status_changes\(\$pdo, \$config\)/)
    assert.match(functionBody(php, 'erp_ks_update'), /erp_ks_notify_status_changes\(\$pdo, \$config\)/)
})

test('ПТО ищется тем же фильтром, что «Приход» и ведомость работ', () => {
    assert.match(php, /\(department = 'ПТО' OR position LIKE '%ПТО%'\) AND status = 'Работает'/)
})

test('крон-подстраховка вызывает и ИД, и КС, защищена токеном', () => {
    const body = functionBody(php, 'erp_pto_notify_status_cron')
    assert.match(body, /erp_require_cron_token/)
    assert.match(body, /erp_ed_notify_status_changes/)
    assert.match(body, /erp_ks_notify_status_changes/)
    assert.match(cronScript, /erp_ed_notify_status_changes/)
    assert.match(cronScript, /erp_ks_notify_status_changes/)
    assert.match(runbook, /internal\/pto-notify-status/)
    assert.match(auditScript, /internal\/pto-notify-status/)
})

test('ведомость работ: param1/param2 сверяются с расценками договора', () => {
    const body = functionBody(php, 'erp_pto_rate_params')
    assert.match(body, /SELECT DISTINCT param1, param2 FROM erp_contract_rates WHERE internal_number = :n/)
    assert.match(api, /export async function fetchPtoRateParams/)
    assert.match(wrPage, /fetchPtoRateParams/)
    assert.match(wrPage, /allow-free-text/)
})

test('клиент ПТО: типы и функции для трёх таблиц плюс справочник договоров', () => {
    for (const name of [
        'fetchPtoContracts', 'fetchPtoRateParams',
        'fetchEdRows', 'createEdRow', 'updateEdRow', 'deleteEdRow',
        'fetchKsRecordRows', 'createKsRecordRow', 'updateKsRecordRow', 'deleteKsRecordRow',
        'fetchWorkStatementRows', 'createWorkStatementRow', 'updateWorkStatementRow', 'deleteWorkStatementRow',
    ]) {
        assert.match(api, new RegExp(`export async function ${name}`))
    }
})

test('три экрана: карточка — тап открывает правку, кнопка «Добавить» в шапке, есть удаление', () => {
    for (const [name, page] of [['ИД', edPage], ['КС', ksPage], ['ВР', wrPage]]) {
        assert.match(page, /variant="inverse".*>Добавить</s, `${name}: «Добавить» должна быть кнопкой действия в шапке`)
        assert.match(page, /@click="removeRow\(row\)"/, `${name}: должно быть удаление строки`)
        assert.match(page, /ErpCombobox/, `${name}: договор выбирается из справочника, а не вводится вручную`)
    }
    // У ИД удаление живёт внутри открытой формы, а не в закрытой карточке:
    // по ТЗ кнопки в блоке быть не должно, но сама возможность удалить
    // запись не теряется.
    assert.match(edPage, /class="ed-edit"[\s\S]*@click="removeRow\(row\)"/)
    // Статус — из списка, а не текстовое поле.
    assert.match(edPage, /v-model="draft\.status".*:options="statusOptions"/s)
    assert.match(ksPage, /v-model="draft\.status".*:options="statusOptions"/s)
})

test('данные в закрытой карточке разделены на столбцы — не только в открытой форме', () => {
    // Приёмка ТЗ: «Данные внутри блоков разделены на столбцы». Заголовок и
    // статус в подписи строки этого не покрывают — само число должно быть
    // видно между строками без тапа, иначе сравнить объём/сумму/материал
    // между записями можно только открыв каждую по очереди.
    assert.match(edPage, /rowMetrics/)
    assert.match(edPage, /label: 'Объём'/)
    assert.match(edPage, /label: 'Стоимость'/)
    assert.match(edPage, /class="ed-tap__metrics"/)

    assert.match(ksPage, /class="ks-tap__metrics"/)
    assert.match(ksPage, /<dt>Сумма<\/dt>/)
    assert.match(ksPage, /<dt>Статус<\/dt>/)

    assert.match(wrPage, /rowMetrics/)
    // Полный список колонок ведомости из ТЗ. «Тег» попадает в заголовок
    // только при пустом описании работы, поэтому своя колонка ему нужна
    // отдельно — иначе у строк с описанием он не виден вовсе.
    for (const label of ['Тег', 'Материал', 'Толщина, мкм', 'Предел', 'Теор. расход', 'Параметр 1', 'Параметр 2']) {
        assert.ok(wrPage.includes(`label: '${label}'`), `ВР: колонки должны включать «${label}»`)
    }
    assert.match(wrPage, /class="wr-tap__metrics"/)
})

test('раздел живёт в своих таблицах и не трогает чужие erp_ed/erp_ks', () => {
    // Имена erp_ed/erp_ks на стенде оказались заняты сторонним импортом с
    // другой схемой: `CREATE TABLE IF NOT EXISTS` его молча пропустил, а
    // раздел падал на каждом запросе. Чужие данные не наши — переименовывать
    // и удалять их нельзя, поэтому раздел ушёл в собственные erp_pto_*.
    assert.doesNotMatch(migration, /RENAME TABLE/)
    assert.doesNotMatch(migration, /DROP TABLE/)
    assert.doesNotMatch(migration, /ALTER TABLE erp_ed\b/)
    assert.doesNotMatch(migration, /ALTER TABLE erp_ks\b/)
    assert.doesNotMatch(migration, /UPDATE erp_ed\b/)
    assert.doesNotMatch(migration, /UPDATE erp_ks\b/)
    assert.doesNotMatch(migration, /DELETE FROM erp_ed\b/)
    assert.doesNotMatch(migration, /DELETE FROM erp_ks\b/)

    // Копирование — ровно один раз и только в пустую таблицу: миграции
    // прогоняются на каждом соединении, задвоить 384 строки нельзя.
    assert.match(migration, /SELECT COUNT\(\*\) = 0 FROM erp_pto_ed/)
    assert.match(migration, /SELECT COUNT\(\*\) = 0 FROM erp_pto_ks/)
    assert.match(migration, /JOIN erp_contracts c ON c\.contract_name = i\.contract_name/)
    // Перенос истории не должен разослать отделу 384 уведомления: статус
    // сразу считается сообщённым.
    assert.match(migration, /i\.status, i\.status/)

    // Запросы раздела ходят только в свои таблицы.
    assert.doesNotMatch(php, /FROM erp_ed\b/)
    assert.doesNotMatch(php, /FROM erp_ks\b/)
    assert.doesNotMatch(php, /INTO erp_ed\b/)
    assert.doesNotMatch(php, /INTO erp_ks\b/)
})

test('статус, уже лежащий в данных, не мешает сохранить запись', () => {
    // В перенесённых КС есть «На согласовании» — значения нет в списке ТЗ.
    // Со справочником-только-из-ТЗ такую строку нельзя было бы сохранить
    // даже после правки одной суммы: валидация отклонила бы её же статус.
    const merge = functionBody(php, 'erp_pto_merge_statuses')
    assert.match(merge, /!in_array\(\$status, \$dictionary, true\)/)
    assert.match(functionBody(php, 'erp_ed_statuses'), /SELECT DISTINCT status FROM erp_pto_ed/)
    assert.match(functionBody(php, 'erp_ks_statuses'), /SELECT DISTINCT status FROM erp_pto_ks/)
})

test('часть (захватка) из данных отдела доезжает до экрана ИД', () => {
    assert.match(migration, /part VARCHAR\(64\) NOT NULL DEFAULT ''/)
    assert.match(functionBody(php, 'erp_ed_row'), /'part' =>/)
    assert.match(functionBody(php, 'erp_ed_input'), /'part' => \$part/)
    assert.match(php, /SELECT id, contract_internal_number, aosr, title, part, volume, cost, status/)
    // В закрытой карточке «Части» по ТЗ быть не должно, но значение не
    // выбрасывается: оно остаётся в форме правки и в базе.
    assert.ok(!edPage.includes("label: 'Часть'"), 'ИД: «Часть» убрана из закрытой карточки')
    assert.match(edPage, /v-model="draft\.part"/)
    assert.match(edPage, /v-model="newDraft\.part"/)
})

test('невидимый хвост из выгрузки не считается сменой статуса', () => {
    // Импорт принёс «Нет ПОЗ\r». Сырое status <> notified_status посчитало бы
    // сменой статуса обычное пересохранение записи, и отдел получил бы
    // уведомление о том, чего не было.
    assert.match(php, /const ERP_PTO_STATUS_CHANGED = /)
    assert.doesNotMatch(php, /WHERE status <> notified_status/)
    for (const fn of ['erp_ed_notify_status_changes', 'erp_ks_notify_status_changes']) {
        assert.match(functionBody(php, fn), /ERP_PTO_STATUS_CHANGED/, `${fn} должна сравнивать очищенные значения`)
    }
    // Очистка идёт и на выдаче, и на входе — иначе «Нет ПОЗ\r» станет
    // отдельным пунктом справочника статусов.
    assert.match(functionBody(php, 'erp_pto_clean'), /str_replace\(\["\\r", "\\n"\], ' ', \(string\) \$value\)/)
    assert.match(functionBody(php, 'erp_ed_row'), /'status' => erp_pto_clean/)
    assert.match(functionBody(php, 'erp_ks_row'), /'status' => erp_pto_clean/)
    assert.match(functionBody(php, 'erp_pto_merge_statuses'), /erp_pto_clean\(\$status\)/)
})

test('ИД: блоки сгруппированы по статусам в порядке из ТЗ', () => {
    // Порядок задан ТЗ и не совпадает ни с алфавитом, ни с порядком
    // справочника ERP_ED_STATUSES — это очередь работы отдела.
    const order = [
        'Согласована', 'На проверке СК', 'Подготовка', 'На проверке ГСП',
        'Устранение замечаний', 'Не хватает Инспекций', 'Не хватает АВК',
        'Нет ПОЗ', 'Подписана',
    ]
    const declared = edPage.slice(edPage.indexOf('const STATUS_ORDER = ['), edPage.indexOf('const STATUS_TONE'))
    for (const status of order) {
        assert.ok(declared.includes(`'${status}'`), `нет статуса «${status}» в порядке групп`)
    }
    const positions = order.map(status => declared.indexOf(`'${status}'`))
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'порядок групп разошёлся с ТЗ')

    assert.match(edPage, /const groups = computed/)
    assert.match(edPage, /v-for="group in groups"/)
    assert.match(edPage, /v-for="row in group\.items"/)

    // Статус вне списка ТЗ («Забрал ВЛС», «Гарантийный объём», пустой) обязан
    // попасть в свою группу, иначе запись исчезнет с экрана, оставшись в базе.
    assert.match(edPage, /index === -1 \? STATUS_ORDER\.length : index/)
    assert.match(edPage, /STATUS_TONE\[status\] \?\? 'neutral'/)
})

test('ИД: цвет блока задан статусом и не сливается с фоном экрана', () => {
    // Заливки — ровно из ТЗ.
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
        const tone = edPage.match(new RegExp(`'${status}': '(\\w+)'`))
        assert.ok(tone, `статусу «${status}» не назначен тон`)
        const block = edPage.slice(edPage.indexOf(`.ed-tone--${tone[1]}`))
        assert.ok(block.slice(0, 120).includes(`--ed-fill: ${fill}`), `«${status}» должен заливаться ${fill}`)
    }

    // Фон экрана — #EAF2FD, и «На проверке» (#d9e1f2) на нём почти
    // растворяется: карточку отделяет контур, иначе не выполнен пункт приёмки
    // «цвет блоков не сливается с фоном».
    assert.match(edPage, /\.ed-card[\s\S]*?border: 1px solid var\(--ed-line\)/)
    for (const tone of ['ok', 'info', 'warn', 'alert', 'done', 'neutral']) {
        const block = edPage.slice(edPage.indexOf(`.ed-tone--${tone}`))
        assert.ok(block.slice(0, 120).includes('--ed-line:'), `тон ${tone} без контура`)
    }

    // Тёмные чернила держат контраст даже на самой насыщенной заливке
    // (#ed7d31); белый текст на ней даёт 2,8:1 и нечитаем.
    assert.match(edPage, /--ed-ink: #16202e/)
    // На #ed7d31 подписи колонок при 0,72 дают всего 3,1:1 — ниже порога.
    assert.match(edPage, /\.ed-card\.ed-tone--alert[\s\S]*?--ed-ink-dim: rgba\(22, 32, 46, 0\.9\)/)
})

test('ИД: поиск по титулу наверху страницы', () => {
    assert.match(edPage, /#search/)
    assert.match(edPage, /ErpSearchBar[\s\S]*?placeholder="Поиск по титулу"/)
    // Именно по титулу — так сказано в ТЗ.
    assert.match(edPage, /row\.title\.toLowerCase\(\)\.includes\(needle\)/)
    // Пустая выдача не должна выглядеть поломкой экрана.
    assert.match(edPage, /ничего не найдено/i)
    assert.match(edPage, /Сбросить поиск/)
})

test('ИД: из блока убраны удаление, часть, статус и договор', () => {
    const card = edPage.slice(edPage.indexOf('<article'), edPage.indexOf('<div v-if="editingId === row.id"'))
    assert.ok(!card.includes('removeRow'), 'кнопки удаления в блоке быть не должно')
    assert.ok(!card.includes('row.part'), '«Часть» убрана из блока')
    assert.ok(!card.includes('row.status'), 'статус несут заголовок группы и цвет')
    assert.ok(!card.includes('row.contractInternalNumber'), 'номер договора убран из блока')

    // Осталось ровно то, что перечислено в ТЗ.
    assert.ok(card.includes('row.title'), 'титул остаётся в блоке')
    assert.ok(card.includes('row.aosr'), 'номер АОСР остаётся в блоке')
    assert.match(edPage, /\{label: 'Объём', value: formatAmount\(row\.volume\)\}/)
    assert.match(edPage, /\{label: 'Стоимость', value: formatAmount\(row\.cost\)\}/)
})

test('кнопка удаления не растягивается во всю высоту карточки', () => {
    // Была красная полоса во весь бок строки: чем выше карточка, тем крупнее
    // выходило самое разрушительное действие на экране.
    for (const [name, page, prefix] of [['КС', ksPage, 'ks'], ['ВР', wrPage, 'wr']]) {
        const row = page.slice(page.indexOf(`.${prefix}-row`), page.indexOf(`.${prefix}-tap`))
        assert.ok(!row.includes('align-items: stretch'), `${name}: строка не должна растягивать кнопку`)
        assert.match(row, /align-items: flex-start/)

        const button = page.slice(page.indexOf(`.${prefix}-remove`))
        assert.match(button.slice(0, 200), /height: 34px/, `${name}: у кнопки удаления должна быть своя высота`)
    }

    // У ИД удаление живёт в форме правки — там оно тоже не во всю ширину.
    const edDelete = edPage.slice(edPage.indexOf('.ed-delete'))
    assert.match(edDelete.slice(0, 200), /justify-self: end/)
    assert.ok(!edDelete.slice(0, 200).includes('width: 100%'), 'ИД: удаление не должно занимать всю ширину формы')
})
