import type {
    ErpBadgeIssue,
    ErpIssuedBadgeEntry,
    ErpPackingEntry,
    ErpPersonnelDepartment,
    ErpPersonnelDraft,
    ErpPersonnelEmployee,
    ErpPersonnelRow,
    ErpPersonnelRight,
    WorkshopId,
} from '~~/types/erp.types'
import {DEFAULT_ACCESS_FLAGS, workshopById} from '~~/types/erp.types'
import {parseCsv} from '~/utils/erp-csv'
import {
    createPersonnelEmployeeViaApi,
    decideApprovalViaApi,
    deleteIssuedBadgeViaApi,
    dismissPersonnelEmployeeViaApi,
    fetchApprovalsViaApi,
    fetchHandedOverTodayViaApi,
    fetchIssuedBadgesTodayViaApi,
    fetchPersonnelDepartmentsViaApi,
    fetchPersonnelEmployeeViaApi,
    fetchPersonnelEmployeesViaApi,
    fetchReportsCurrentViaApi,
    fetchReportsIdViaApi,
    fetchReportsKsViaApi,
    fetchWorkshopBadgesViaApi,
    getErpBackendMode,
    issueBadgeViaApi,
    loginErpEmployeeViaApi,
    recordHandoverViaApi,
    recordWorkLogViaApi,
    savePersonnelEmployeeViaApi,
    undoHandoverViaApi,
} from '~/utils/erp-api'
import type {ErpApprovalDecisionStatus, ErpApprovalsResponse, ErpCurrentReport, ErpIdRow, ErpKsRow} from '~/utils/erp-api'
import {
    GAS_URL_STORAGE_KEY,
    ISSUE_SHEET,
    ISSUE_SHEET_GID,
    JOURNAL_SHEET,
    getConfig,
    isErpDemoMode,
    isGasConfigured,
    isSheetsApiConfigured,
    requestGas,
    requestGasPost,
} from '~/utils/erp/transport'
import type {GasResponse, SheetsRuntimeConfig} from '~/utils/erp/transport'

// Транспорт к GAS и конфигурация листов переехали в ~/utils/erp/transport.
// Реэкспорт сохраняет прежний публичный интерфейс: страницы, компоненты и
// сторы продолжают импортировать всё из erp-sheets без правок.
export type {ErpLoginProfile, PersonnelActor} from '~/utils/erp/transport'

const MOCK_BADGES: Record<WorkshopId, string[]> = {
    kolpino: [
        'Бирка К-101 · Сборка корпуса',
        'Бирка К-102 · Покраска',
        'Бирка К-103 · Контроль качества',
    ],
    volkhonka: [
        'Бирка В-201 · Механический цех',
        'Бирка В-202 · Склад готовой продукции',
        'Бирка В-203 · Упаковка',
    ],
}


function parseBadgeColumn(rows: string[][], workshopId: WorkshopId): string[] {
    if (rows.length === 0) return []

    const header = rows[0] ?? []
    const columnTitle = workshopById(workshopId).sheetColumn
    const columnIndex = header.findIndex(cell => cell.trim() === columnTitle)

    if (columnIndex < 0) {
        throw new Error(`Колонка «${columnTitle}» не найдена на листе «${ISSUE_SHEET}»`)
    }

    const badges: string[] = []

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const value = (rows[rowIndex]?.[columnIndex] ?? '').trim()
        if (value) badges.push(value)
    }

    return badges
}

async function fetchBadgesViaPublicCsv(config: SheetsRuntimeConfig, workshopId: WorkshopId): Promise<string[]> {
    const url = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=csv&gid=${config.issueSheetGid}`
    const response = await fetch(url)

    if (!response.ok) {
        throw new Error('Не удалось загрузить лист «Выдача»')
    }

    const csvText = await response.text()
    if (csvText.trimStart().startsWith('<')) {
        throw new Error('Лист «Выдача» недоступен для чтения')
    }

    return parseBadgeColumn(parseCsv(csvText), workshopId)
}

async function fetchBadgesViaGas(config: SheetsRuntimeConfig, workshopId: WorkshopId): Promise<string[]> {
    const result = await requestGas(config, {
        action: 'badges',
        workshop: workshopId,
    })

    if (!result.ok) {
        throw new Error(result.error || 'Не удалось загрузить бирки')
    }

    return result.badges ?? []
}

async function fetchBadgesViaApi(config: SheetsRuntimeConfig, workshopId: WorkshopId): Promise<string[]> {
    const range = encodeURIComponent(`${ISSUE_SHEET}!A1:Z5000`)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}?key=${config.apiKey}`

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error('Не удалось загрузить список бирок из Google Таблицы')
    }

    const payload = await response.json() as { values?: string[][] }
    return parseBadgeColumn(payload.values ?? [], workshopId)
}

export async function fetchWorkshopBadges(workshopId: WorkshopId): Promise<string[]> {
    if (getErpBackendMode() === 'sql') {
        return await fetchWorkshopBadgesViaApi(workshopId)
    }

    // Демо / чистый локальный запуск: без ID таблицы и без GAS — только моки.
    if (getErpSheetsMode() === 'mock' || isErpDemoMode()) {
        return MOCK_BADGES[workshopId]
    }

    const config = getConfig()
    let gasError: unknown

    if (isGasConfigured(config)) {
        try {
            return await fetchBadgesViaGas(config, workshopId)
        } catch (error) {
            // fallback если GAS ещё не задеплоен, а таблица уже публична —
            // но если ни один способ не сработает, это и есть реальная
            // причина сбоя, её и покажем вызывающему коду.
            gasError = error
        }
    }

    if (config.spreadsheetId && config.issueSheetGid) {
        try {
            return await fetchBadgesViaPublicCsv(config, workshopId)
        } catch {
            // пробуем другие способы
        }
    }

    if (isSheetsApiConfigured(config)) {
        return fetchBadgesViaApi(config, workshopId)
    }

    // Моки — только когда вообще ничего не настроено (первый запуск без
    // конфигурации). Если GAS настроен, но недоступен, это поломка,
    // которую нужно показать пользователю, а не подменять тестовыми данными.
    if (gasError) throw gasError

    return MOCK_BADGES[workshopId]
}

async function issueBadgeViaGas(
    config: SheetsRuntimeConfig,
    entry: ErpBadgeIssue,
): Promise<void> {
    const result = await requestGasPost(config, {
        action: 'issueBadge',
        workshop: entry.workshopId,
        fio: entry.fio,
        badgeContent: entry.badgeContent,
    })

    if (!result.ok) {
        throw new Error(result.error || 'Ошибка записи в журнал')
    }
}

export async function fetchIssuedBadgesToday(fio: string, workshopId: WorkshopId | null): Promise<ErpIssuedBadgeEntry[]> {
    if (getErpBackendMode() === 'sql') {
        return await fetchIssuedBadgesTodayViaApi(fio, workshopId)
    }

    const config = getConfig()

    if (!isGasConfigured(config)) {
        return []
    }

    const result = await requestGas(config, {
        action: 'issuedToday',
        fio,
        ...(workshopId ? {workshop: workshopId} : {}),
    })

    if (!result.ok) {
        throw new Error(result.error || 'Не удалось загрузить бирки за смену')
    }

    return result.entries ?? []
}

export async function deleteIssuedBadge(entry: ErpIssuedBadgeEntry, fio: string): Promise<void> {
    if (getErpBackendMode() === 'sql') {
        await deleteIssuedBadgeViaApi(entry, fio)
        return
    }

    const config = getConfig()

    if (!isGasConfigured(config)) {
        throw new Error('Журнал не подключён')
    }

    const result = await requestGasPost(config, {
        action: 'deleteIssuedBadge',
        row: String(entry.row),
        fio,
        badgeContent: entry.badge,
    })

    if (!result.ok) {
        throw new Error(result.error || 'Не удалось удалить бирку')
    }
}

export async function fetchHandedOverBadgesToday(fio: string): Promise<ErpIssuedBadgeEntry[]> {
    if (getErpBackendMode() === 'sql') {
        return await fetchHandedOverTodayViaApi(fio)
    }

    const config = getConfig()

    if (!isGasConfigured(config)) {
        return []
    }

    const result = await requestGas(config, {
        action: 'handedOverToday',
        fio,
    })

    if (!result.ok) {
        throw new Error(result.error || 'Не удалось загрузить сданные бирки')
    }

    return result.entries ?? []
}

export async function fetchCurrentReports(): Promise<ErpCurrentReport> {
    if (getErpBackendMode() !== 'sql') {
        throw new Error('Отчёты доступны в проверочном SQL-контуре')
    }
    return await fetchReportsCurrentViaApi()
}

export async function fetchReportsKs(): Promise<ErpKsRow[]> {
    if (getErpBackendMode() !== 'sql') {
        throw new Error('Отчёты доступны в проверочном SQL-контуре')
    }
    return await fetchReportsKsViaApi()
}

export async function fetchReportsId(): Promise<ErpIdRow[]> {
    if (getErpBackendMode() !== 'sql') {
        throw new Error('Отчёты доступны в проверочном SQL-контуре')
    }
    return await fetchReportsIdViaApi()
}

export async function recordHandoverEntry(fio: string, badgeContent: string, tag: string): Promise<void> {
    if (getErpBackendMode() === 'sql') {
        await recordHandoverViaApi(
            badgeContent,
            tag,
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
                : undefined,
        )
        return
    }

    const config = getConfig()

    if (!isGasConfigured(config)) {
        throw new Error('Журнал не подключён')
    }

    const result = await requestGasPost(config, {
        action: 'recordHandover',
        fio,
        badgeContent,
    })

    if (!result.ok) {
        throw new Error(result.error || 'Не удалось записать сдачу')
    }
}

export async function undoHandover(entry: ErpIssuedBadgeEntry, fio: string): Promise<void> {
    if (getErpBackendMode() === 'sql') {
        await undoHandoverViaApi(entry, fio)
        return
    }

    const config = getConfig()

    if (!isGasConfigured(config)) {
        throw new Error('Журнал не подключён')
    }

    const result = await requestGasPost(config, {
        action: 'undoHandover',
        row: String(entry.row),
        fio,
        badgeContent: entry.badge,
    })

    if (!result.ok) {
        throw new Error(result.error || 'Не удалось отменить сдачу')
    }
}

export async function loginErpEmployee(login: string, password: string): Promise<ErpLoginProfile> {
    if (getErpBackendMode() === 'sql') {
        const profile = await loginErpEmployeeViaApi(login, password)
        return {...profile, password: ''}
    }

    if (isErpDemoMode()) {
        return {
            fio: 'Иванов Иван Иванович',
            department: 'Производство',
            position: 'Мастер',
            platform: 'Колпино',
            role: 'demo',
            login: login.trim() || 'demo',
            password: '',
            access: {
                ...DEFAULT_ACCESS_FLAGS,
                badges: true,
                packing: true,
                measurements: true,
                handover: true,
                reports: true,
            },
        }
    }

    const config = getConfig()

    if (!isGasConfigured(config)) {
        throw new Error('Журнал не подключён')
    }

    const result = await requestGasPost(config, {action: 'login', login, password})

    if (!result.ok || !result.fio) {
        throw new Error(result.error || 'Не удалось войти')
    }

    return {
        fio: result.fio,
        department: result.department ?? '',
        position: result.position ?? '',
        platform: result.platform ?? '',
        role: result.role ?? '',
        login: result.login ?? login,
        password: result.password ?? '',
        access: result.access
            ? {...DEFAULT_ACCESS_FLAGS, ...result.access}
            : {...DEFAULT_ACCESS_FLAGS},
    }
}

function assertPersonnelActor(actor: PersonnelActor): void {
    if (!actor.login.trim() || !actor.password) {
        throw new Error('Войдите заново, чтобы управлять кадрами')
    }
}

function personnelPayload(action: string, actor: PersonnelActor, fields: Record<string, unknown> = {}): Record<string, unknown> {
    assertPersonnelActor(actor)
    return {
        action,
        actorLogin: actor.login,
        actorPassword: actor.password,
        ...fields,
    }
}

function normalizePersonnelEmployee(employee: ErpPersonnelEmployee): ErpPersonnelEmployee {
    return {
        ...employee,
        role: employee.role === 'Менеджер' ? 'Менеджер' : 'Исполнитель',
        rights: (employee.rights ?? []).map((right): ErpPersonnelRight => ({
            name: right.name,
            value: right.value === 'Да' ? 'Да' : 'Нет',
        })),
    }
}

async function requestPersonnel(config: SheetsRuntimeConfig, action: string, actor: PersonnelActor, fields: Record<string, unknown> = {}): Promise<GasResponse> {
    const payload = personnelPayload(action, actor, fields)
    const result = await requestGasPost(config, payload)
    if (!result.ok) throw new Error(result.error || 'Не удалось обновить данные сотрудников')
    return result
}

export async function fetchPersonnelDepartments(actor: PersonnelActor): Promise<{ departments: ErpPersonnelDepartment[]; platforms: string[]; rights: ErpPersonnelRight[] }> {
    if (getErpBackendMode() === 'sql') {
        const result = await fetchPersonnelDepartmentsViaApi()
        return {
            departments: result.departments ?? [],
            platforms: result.platforms ?? [],
            rights: (result.rights ?? []) as ErpPersonnelRight[],
        }
    }

    const config = getConfig()
    if (!isGasConfigured(config)) throw new Error('Кадровый сервис не подключён')
    const result = await requestPersonnel(config, 'personnelDepartments', actor)
    return {departments: result.departments ?? [], platforms: result.platforms ?? [], rights: result.rights ?? []}
}

export async function fetchPersonnelEmployees(actor: PersonnelActor, department: string): Promise<ErpPersonnelRow[]> {
    if (getErpBackendMode() === 'sql') {
        return await fetchPersonnelEmployeesViaApi(department)
    }

    const config = getConfig()
    if (!isGasConfigured(config)) throw new Error('Кадровый сервис не подключён')
    const result = await requestPersonnel(config, 'personnelEmployees', actor, {department})
    return result.employees ?? []
}

export async function fetchPersonnelEmployee(actor: PersonnelActor, row: number, fio: string): Promise<ErpPersonnelEmployee> {
    if (getErpBackendMode() === 'sql') {
        const employee = await fetchPersonnelEmployeeViaApi(row)
        return normalizePersonnelEmployee(employee)
    }

    const config = getConfig()
    if (!isGasConfigured(config)) throw new Error('Кадровый сервис не подключён')
    const result = await requestPersonnel(config, 'personnelEmployee', actor, {row, fio})
    if (!result.employee) throw new Error('Сотрудник не найден')
    return normalizePersonnelEmployee(result.employee)
}

function rightsPayload(rights: ErpPersonnelRight[]): Record<string, 'Да' | 'Нет'> {
    return Object.fromEntries(rights.map((right) => [right.name, right.value]))
}

export async function savePersonnelEmployee(actor: PersonnelActor, row: number, fio: string, draft: ErpPersonnelDraft): Promise<ErpPersonnelEmployee> {
    if (getErpBackendMode() === 'sql') {
        const employee = await savePersonnelEmployeeViaApi(row, {
            platform: draft.platform,
            role: draft.role,
            login: draft.login,
            password: draft.password ?? '',
            rights: draft.rights,
        })
        return normalizePersonnelEmployee(employee)
    }

    const config = getConfig()
    if (!isGasConfigured(config)) throw new Error('Кадровый сервис не подключён')
    const result = await requestPersonnel(config, 'personnelSave', actor, {
        row,
        fio,
        platform: draft.platform,
        role: draft.role,
        login: draft.login,
        password: draft.password ?? '',
        rights: rightsPayload(draft.rights),
    })
    if (!result.employee) throw new Error('Не удалось сохранить карточку сотрудника')
    return normalizePersonnelEmployee(result.employee)
}

export async function createPersonnelEmployee(actor: PersonnelActor, draft: ErpPersonnelDraft): Promise<ErpPersonnelEmployee> {
    if (getErpBackendMode() === 'sql') {
        const employee = await createPersonnelEmployeeViaApi({
            fio: draft.fio,
            department: draft.department,
            position: draft.position,
            platform: draft.platform,
            role: draft.role,
            login: draft.login,
            rights: draft.rights,
        })
        return normalizePersonnelEmployee(employee)
    }

    const config = getConfig()
    if (!isGasConfigured(config)) throw new Error('Кадровый сервис не подключён')
    const result = await requestPersonnel(config, 'personnelCreate', actor, {
        fio: draft.fio,
        department: draft.department,
        position: draft.position,
        platform: draft.platform,
        role: draft.role,
        login: draft.login,
        rights: rightsPayload(draft.rights),
    })
    if (!result.employee) throw new Error('Не удалось добавить сотрудника')
    return normalizePersonnelEmployee(result.employee)
}

export async function dismissPersonnelEmployee(actor: PersonnelActor, row: number, fio: string): Promise<void> {
    if (getErpBackendMode() === 'sql') {
        await dismissPersonnelEmployeeViaApi(row)
        return
    }

    const config = getConfig()
    if (!isGasConfigured(config)) throw new Error('Кадровый сервис не подключён')
    await requestPersonnel(config, 'personnelDismiss', actor, {row, fio})
}

const APPROVALS_SQL_ONLY = 'Согласования доступны только на staging с SQL API.'

export async function fetchApprovals(): Promise<ErpApprovalsResponse> {
    if (getErpBackendMode() === 'sql') {
        return fetchApprovalsViaApi()
    }
    throw new Error(APPROVALS_SQL_ONLY)
}

export async function decideApproval(input: {
    id: number
    action: 'approve' | 'reject'
}): Promise<{status: ErpApprovalDecisionStatus}> {
    if (getErpBackendMode() === 'sql') {
        return decideApprovalViaApi(input)
    }
    throw new Error(APPROVALS_SQL_ONLY)
}

/** Ключ идемпотентности для журнала работ: повтор не задваивает работу. */
function workLogKey(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
        : `${Date.now()}${Math.random()}`.replace(/\D/g, '').slice(0, 32)
}

/**
 * Запись работы в журнал после успешной записи в GAS.
 *
 * Журнал ведётся в SQL, поэтому в режиме gas писать некуда — молча выходим.
 * Сбой самой записи не отменяет уже выполненную работу: сотрудник получил
 * подтверждение, и падать после него значило бы врать про результат.
 */
async function logWork(work: {tag: string; badge: string; thickness?: number | null}): Promise<void> {
    if (getErpBackendMode() !== 'sql') return
    try {
        await recordWorkLogViaApi({...work, idempotencyKey: workLogKey()})
    } catch (error) {
        console.error('Работа выполнена, но не попала в журнал работ', error)
    }
}

export async function recordMeasurement(
    fio: string,
    badge: string,
    coverage: string,
    zones: (number | null)[],
): Promise<void> {
    const config = getConfig()

    if (!isGasConfigured(config)) {
        throw new Error('Журнал не подключён')
    }

    const [z1, z2, z3, z4, z5] = zones

    const result = await requestGasPost(config, {
        action: 'recordMeasurement',
        fio,
        badge,
        coverage,
        zone1: z1 != null ? String(z1) : '',
        zone2: z2 != null ? String(z2) : '',
        zone3: z3 != null ? String(z3) : '',
        zone4: z4 != null ? String(z4) : '',
        zone5: z5 != null ? String(z5) : '',
    })

    if (!result.ok) {
        throw new Error(result.error || 'Не удалось записать промер')
    }

    // В журнал кладём среднюю фактическую толщину по заполненным зонам:
    // сценарий промера требует её записать, а зон в журнале одна колонка.
    const measured = zones.filter((zone): zone is number => zone != null)
    await logWork({
        tag: 'Промер',
        badge,
        thickness: measured.length
            ? Math.round((measured.reduce((sum, zone) => sum + zone, 0) / measured.length) * 1000) / 1000
            : null,
    })
}

export async function recordPackingEntry(platform: string, fio: string, machine: string, qrText: string): Promise<void> {
    const config = getConfig()

    if (!isGasConfigured(config)) {
        throw new Error('Журнал не подключён')
    }

    const result = await requestGasPost(config, {
        action: 'recordPacking',
        platform,
        fio,
        machine,
        qrText,
    })

    if (!result.ok) {
        throw new Error(result.error || 'Не удалось записать упаковку')
    }

    // Две записи: по ТЗ упаковка закрывает и упаковку, и исполнительную
    // документацию, а колонка тега одна.
    for (const tag of ['Упаковка', 'ИД']) {
        await logWork({tag, badge: qrText})
    }
}

export async function fetchPackingToday(fio: string, machine: string): Promise<ErpPackingEntry[]> {
    const config = getConfig()

    if (!isGasConfigured(config)) {
        return []
    }

    const result = await requestGas(config, {
        action: 'packingToday',
        fio,
        machine,
    })

    if (!result.ok) {
        throw new Error(result.error || 'Не удалось загрузить упаковку за смену')
    }

    return result.packingEntries ?? []
}

export type JournalWriteResult = 'ok' | 'skipped'

export async function appendBadgeJournalEntry(entry: ErpBadgeIssue): Promise<JournalWriteResult> {
    if (getErpBackendMode() === 'sql') {
        await issueBadgeViaApi({
            workshopId: entry.workshopId,
            badgeContent: entry.badgeContent,
            idempotencyKey: typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID().replace(/-/g, '').slice(0, 32)
                : undefined,
        })
        return 'ok'
    }

    const config = getConfig()

    if (!isGasConfigured(config)) {
        return 'skipped'
    }

    await issueBadgeViaGas(config, entry)
    return 'ok'
}

export function getErpSheetsMode(): 'gas' | 'csv' | 'api' | 'mock' {
    if (isErpDemoMode()) return 'mock'
    const config = getConfig()
    if (isGasConfigured(config)) return 'gas'
    if (config.spreadsheetId && config.issueSheetGid) return 'csv'
    if (isSheetsApiConfigured(config)) return 'api'
    return 'mock'
}

export function saveErpGasUrl(url: string): void {
    if (!import.meta.client) return
    const trimmed = url.trim()
    if (trimmed) {
        localStorage.setItem(GAS_URL_STORAGE_KEY, trimmed)
    } else {
        localStorage.removeItem(GAS_URL_STORAGE_KEY)
    }
}

export function getErpGasUrl(): string {
    return getConfig().gasUrl
}

export async function testErpGasConnection(gasUrl: string): Promise<{ ok: boolean; badgesCount?: number; error?: string }> {
    const config = {...getConfig(), gasUrl}
    try {
        const badges = await fetchBadgesViaGas(config, 'kolpino')
        return {ok: true, badgesCount: badges.length}
    } catch (error) {
        return {
            ok: false,
            error: errorMessage(error, 'Ошибка подключения'),
        }
    }
}

export {ISSUE_SHEET, ISSUE_SHEET_GID, JOURNAL_SHEET}
export {isErpDemoMode} from '~/utils/erp/transport'
