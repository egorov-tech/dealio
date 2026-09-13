import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../public/api/migrations/023_erp_ed_ks.sql', import.meta.url), 'utf8')
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
    assert.match(migration, /CREATE TABLE IF NOT EXISTS erp_ed/)
    assert.match(migration, /CREATE TABLE IF NOT EXISTS erp_ks/)
    for (const table of ['erp_ed', 'erp_ks']) {
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
    assert.match(edInput, /in_array\(\$status, ERP_ED_STATUSES, true\)/)
    const ksInput = functionBody(php, 'erp_ks_input')
    assert.match(ksInput, /in_array\(\$status, ERP_KS_STATUSES, true\)/)
})

test('изменение статуса ИД/КС уведомляет ПТО — тот же diff-приём, что у заявок и счетов', () => {
    // Событие — расхождение status <> notified_status, а не вызов из
    // конкретного места: тот же приём, что erp_supply_notify_status_changes
    // и erp_approvals_notify_status_changes.
    for (const [fn, table, url] of [
        ['erp_ed_notify_status_changes', 'erp_ed', "'/pto-ed'"],
        ['erp_ks_notify_status_changes', 'erp_ks', "'/pto-ks'"],
    ]) {
        const body = functionBody(php, fn)
        assert.match(body, new RegExp(`FROM ${table} WHERE status <> notified_status`))
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
    for (const label of ['Материал', 'Толщина, мкм', 'Предел', 'Теор. расход', 'Параметр 1', 'Параметр 2']) {
        assert.ok(wrPage.includes(`label: '${label}'`), `ВР: колонки должны включать «${label}»`)
    }
    assert.match(wrPage, /class="wr-tap__metrics"/)
})
