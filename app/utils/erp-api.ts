import type {ErpAccessFlags} from '~~/types/erp.types'

export interface ErpApiLoginProfile {
    fio: string
    department: string
    position: string
    platform: string
    role: string
    login: string
    access: ErpAccessFlags
}

export class ErpApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message)
    }
}

// A stalled bridge must surface a recoverable state instead of leaving a
// mobile screen on an infinite loader. Keep this below the browser's own
// transport timeout while allowing a cold Google Apps Script response.
const ERP_API_TIMEOUT_MS = 12_000

export interface ErpReportRow {
    customer: string
    contract: string
    site: string
    /** «Отчёт месяца»: ТП, отгрузка в тоннах и в м², остаток в цехе. */
    productionRub: number
    shippedTons: number
    inWorkshopTons: number
    shippedSquareMeters: number
    // «Полный отчёт» — та же строка листа за весь период работы, а не за
    // месяц (колонки D и E). Лист один, запрос к мосту тоже один.
    productionTotalRub: number
    shippedTotalTons: number
}

export interface ErpCurrentReport {
    updatedAt: string
    period: string
    /** Сводка только за месяц: в «Полном отчёте» блока сводных данных нет. */
    summary: {
        productionRub: number
        shippedTons: number
        inWorkshopTons: number
    }
    rows: ErpReportRow[]
}

/** Строка листа «КС»: номер КС внутри договора, сумма с НДС, статус. */
export interface ErpKsRow {
    contract: string
    number: string
    amountWithVat: number
    status: string
}

/** Строка листа «ИД»: статус исполнительной документации внутри договора. */
export interface ErpIdRow {
    contract: string
    status: string
    area: number
    amountWithVat: number
}

export function getErpBackendMode(): 'gas' | 'sql' {
    return useRuntimeConfig().public.erpBackendMode === 'sql' ? 'sql' : 'gas'
}

function getErpApiBase(): string {
    return useRuntimeConfig().public.erpApiBase || '/api'
}

/**
 * Запрос к SQL API.
 *
 * `timeoutMs` — для операций, которые заведомо не укладываются в общий
 * таймаут: загрузка PDF-счёта по мобильной связи в цеху занимает минуту и
 * больше, и обрыв на 12 секундах выглядел бы как «ничего не работает».
 */
export async function erpApiRequest<T>(
    path: string,
    init: RequestInit & {timeoutMs?: number} = {},
): Promise<T> {
    let response: Response
    const controller = new AbortController()
    const abortFromCaller = () => controller.abort()
    const timeout = globalThis.setTimeout(abortFromCaller, init.timeoutMs ?? ERP_API_TIMEOUT_MS)
    init.signal?.addEventListener('abort', abortFromCaller, {once: true})

    try {
        const base = getErpApiBase().replace(/\/$/, '')
        const route = path.replace(/^\//, '')
        // FormData сам несёт Content-Type с boundary. Подставленный
        // application/json ломает разбор multipart на сервере, и файл до
        // него не доезжает вовсе.
        const isMultipart = init.body instanceof FormData
        response = await fetch(base + '/' + route, {
            ...init,
            credentials: 'include',
            headers: {
                ...(isMultipart ? {} : {'Content-Type': 'application/json'}),
                ...init.headers,
            },
            signal: controller.signal,
        })
    } catch {
        throw new ErpApiError('Нет связи с ERP. Проверьте интернет и повторите.', 0)
    } finally {
        globalThis.clearTimeout(timeout)
        init.signal?.removeEventListener('abort', abortFromCaller)
    }

    const payload = await response.json().catch(() => null) as {
        ok?: boolean
        data?: T
        error?: {message?: string}
    } | null

    if (!response.ok || !payload?.ok) {
        throw new ErpApiError(payload?.error?.message || 'ERP временно недоступна. Повторите попытку.', response.status)
    }

    return payload.data as T
}

export async function loginErpEmployeeViaApi(login: string, password: string): Promise<ErpApiLoginProfile> {
    return erpApiRequest<ErpApiLoginProfile>('auth/login', {
        method: 'POST',
        body: JSON.stringify({login, password}),
    })
}

export async function restoreErpEmployee(): Promise<ErpApiLoginProfile | null> {
    try {
        return await erpApiRequest<ErpApiLoginProfile>('auth/me')
    } catch (error) {
        if (error instanceof ErpApiError && error.status === 401) return null
        throw error
    }
}

export async function logoutErpEmployee(): Promise<void> {
    await erpApiRequest<null>('auth/logout', {method: 'POST'})
}

// Отчёт идёт за данными в Google-таблицу через мост, и на холодном старте
// Apps Script будит проект секунд двадцать. Общего таймаута в двенадцать
// секунд на это не хватало: запрос обрывался на середине, а на экране это
// выглядело зависшей загрузкой.
const ERP_REPORTS_TIMEOUT_MS = 50_000

export async function fetchReportsCurrentViaApi(): Promise<ErpCurrentReport> {
    return erpApiRequest<ErpCurrentReport>('reports/current', {timeoutMs: ERP_REPORTS_TIMEOUT_MS})
}

// КС и ИД читаются из своих таблиц (erp_pto_ks/erp_pto_ed), не из
// Google-таблицы через мост — холодный старт Apps Script им не грозит,
// хватает общего таймаута запроса.
export async function fetchReportsKsViaApi(): Promise<ErpKsRow[]> {
    const data = await erpApiRequest<{rows: ErpKsRow[]}>('reports/ks')
    return data.rows ?? []
}

export async function fetchReportsIdViaApi(): Promise<ErpIdRow[]> {
    const data = await erpApiRequest<{rows: ErpIdRow[]}>('reports/id')
    return data.rows ?? []
}

export async function fetchPersonnelDepartmentsViaApi(): Promise<{
    departments: Array<{department: string; activeCount: number}>
    platforms: string[]
    rights: Array<{name: string; value: string}>
}> {
    return erpApiRequest('personnel/departments')
}

export async function fetchPersonnelEmployeesViaApi(department: string): Promise<Array<{
    id: number
    row: number
    fio: string
    position: string
}>> {
    const data = await erpApiRequest<{employees: Array<{id: number; row: number; fio: string; position: string}>}>(
        `personnel/employees?department=${encodeURIComponent(department)}`,
    )
    return data.employees ?? []
}

export async function fetchPersonnelEmployeeViaApi(id: number): Promise<{
    id: number
    row: number
    fio: string
    department: string
    position: string
    platform: string
    role: string
    login: string
    password: string
    status: string
    rights: Array<{name: string; value: string}>
}> {
    const data = await erpApiRequest<{employee: {
        id: number
        row: number
        fio: string
        department: string
        position: string
        platform: string
        role: string
        login: string
        password: string
        status: string
        rights: Array<{name: string; value: string}>
    }}>(`personnel/employees/${id}`)
    if (!data.employee) throw new ErpApiError('Сотрудник не найден', 404)
    return data.employee
}

export type ErpApiPersonnelEmployee = Awaited<ReturnType<typeof fetchPersonnelEmployeeViaApi>>

export async function savePersonnelEmployeeViaApi(
    id: number,
    draft: {
        platform: string
        role: string
        login: string
        password?: string
        rights: Array<{name: string; value: string}>
    },
): Promise<ErpApiPersonnelEmployee> {
    const data = await erpApiRequest<{employee: ErpApiPersonnelEmployee}>(`personnel/employees/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
            platform: draft.platform,
            role: draft.role,
            login: draft.login,
            password: draft.password ?? '',
            rights: Object.fromEntries(draft.rights.map((right) => [right.name, right.value])),
        }),
    })
    if (!data.employee) throw new ErpApiError('Не удалось сохранить карточку сотрудника', 500)
    return data.employee
}

export async function createPersonnelEmployeeViaApi(draft: {
    fio: string
    department: string
    position: string
    platform: string
    role: string
    login: string
    rights: Array<{name: string; value: string}>
}): Promise<ErpApiPersonnelEmployee> {
    const data = await erpApiRequest<{employee: ErpApiPersonnelEmployee}>('personnel/employees', {
        method: 'POST',
        body: JSON.stringify({
            fio: draft.fio,
            department: draft.department,
            position: draft.position,
            platform: draft.platform,
            role: draft.role,
            login: draft.login,
            rights: Object.fromEntries(draft.rights.map((right) => [right.name, right.value])),
        }),
    })
    if (!data.employee) throw new ErpApiError('Не удалось добавить сотрудника', 500)
    return data.employee
}

export async function dismissPersonnelEmployeeViaApi(id: number): Promise<void> {
    await erpApiRequest<null>(`personnel/employees/${id}/dismiss`, {method: 'POST'})
}

export async function fetchWorkshopBadgesViaApi(workshopId: string): Promise<string[]> {
    const data = await erpApiRequest<{badges: string[]}>(`badges?workshop=${encodeURIComponent(workshopId)}`)
    return data.badges ?? []
}

export async function issueBadgeViaApi(input: {
    workshopId: string
    badgeContent: string
    idempotencyKey?: string
}): Promise<{id: number; row: number; badge: string; time: string}> {
    const data = await erpApiRequest<{entry: {id: number; row: number; badge: string; time: string}}>('badges/issues', {
        method: 'POST',
        body: JSON.stringify({
            workshop: input.workshopId,
            badgeContent: input.badgeContent,
            idempotencyKey: input.idempotencyKey,
        }),
    })
    if (!data.entry) throw new ErpApiError('Не удалось записать бирку', 500)
    return data.entry
}

export async function fetchIssuedBadgesTodayViaApi(
    fio: string,
    workshopId: string | null,
): Promise<Array<{id: number; row: number; badge: string; time: string}>> {
    const params = new URLSearchParams()
    if (fio) params.set('fio', fio)
    if (workshopId) params.set('workshop', workshopId)
    const qs = params.toString()
    const data = await erpApiRequest<{entries: Array<{id: number; row: number; badge: string; time: string}>}>(
        `badges/issues/today${qs ? `?${qs}` : ''}`,
    )
    return data.entries ?? []
}

export async function deleteIssuedBadgeViaApi(entry: {row: number; badge: string}, fio: string): Promise<void> {
    await erpApiRequest<null>(`badges/issues/${entry.row}`, {
        method: 'DELETE',
        body: JSON.stringify({fio, badgeContent: entry.badge}),
    })
}

export async function recordHandoverViaApi(badgeContent: string, tag: string, idempotencyKey?: string): Promise<{
    id: number
    row: number
    badge: string
    time: string
}> {
    const data = await erpApiRequest<{entry: {id: number; row: number; badge: string; time: string}}>('handover/entries', {
        method: 'POST',
        body: JSON.stringify({badgeContent, tag, idempotencyKey}),
    })
    if (!data.entry) throw new ErpApiError('Не удалось записать сдачу', 500)
    return data.entry
}

export async function fetchHandedOverTodayViaApi(fio: string): Promise<Array<{id: number; row: number; badge: string; time: string}>> {
    const qs = fio ? `?fio=${encodeURIComponent(fio)}` : ''
    const data = await erpApiRequest<{entries: Array<{id: number; row: number; badge: string; time: string}>}>(
        `handover/entries/today${qs}`,
    )
    return data.entries ?? []
}

export async function undoHandoverViaApi(entry: {row: number; badge: string}, fio: string): Promise<void> {
    await erpApiRequest<null>(`handover/entries/${entry.row}`, {
        method: 'DELETE',
        body: JSON.stringify({fio, badgeContent: entry.badge}),
    })
}

export interface ErpApproval {
    id: number
    stage: 'manager' | 'director'
    site: string
    departmentType: string
    invoice: string
    amount: number
}

export interface ErpApprovalsResponse {
    rows: ErpApproval[]
    pendingCount: number
}

export type ErpApprovalDecisionStatus = 'approved' | 'rejected' | 'already_processed'

export async function fetchApprovalsViaApi(): Promise<ErpApprovalsResponse> {
    return erpApiRequest<ErpApprovalsResponse>('approvals')
}

export async function decideApprovalViaApi(input: {
    id: number
    action: 'approve' | 'reject'
}): Promise<{status: ErpApprovalDecisionStatus}> {
    return erpApiRequest<{status: ErpApprovalDecisionStatus}>('approvals/decisions', {
        method: 'POST',
        body: JSON.stringify(input),
    })
}

/**
 * Запись работы в журнал из раздела, который ещё живёт на Google Apps Script.
 *
 * Промеры и упаковка пишутся в GAS, поэтому сервер не узнаёт о работе сам —
 * экран сообщает о ней после успешной записи. Сдача уже на SQL и пишет журнал
 * внутри своей транзакции, эта функция ей не нужна.
 *
 * Ключ идемпотентности обязателен: повтор после потерянного ответа не должен
 * задваивать работу в журнале.
 */
export async function recordWorkLogViaApi(work: {
    tag: string
    badge: string
    thickness?: number | null
    idempotencyKey: string
}): Promise<void> {
    await erpApiRequest('work-log', {method: 'POST', body: JSON.stringify(work)})
}
