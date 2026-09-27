import type {
    ErpAccessFlags,
    ErpIssuedBadgeEntry,
    ErpPackingEntry,
    ErpPersonnelDepartment,
    ErpPersonnelEmployee,
    ErpPersonnelRow,
    ErpPersonnelRight,
} from '~~/types/erp.types'

/**
 * Транспорт к Google Apps Script и общая конфигурация листов.
 *
 * Выделено из erp-sheets.ts: там это лежало вперемешку с бизнес-операциями
 * (бирки, кадры, сдача, согласования), хотя используется всеми доменами и
 * меняется по другим причинам — при переезде на SQL API уходить будет
 * именно этот слой, а не сами операции.
 */

export const ISSUE_SHEET = 'Выдача'
export const JOURNAL_SHEET = 'Журнал выдачи бирок'

/** Legacy gid листа «Выдача» — только если задан NUXT_PUBLIC_ERP_ISSUE_SHEET_GID. */
export const ISSUE_SHEET_GID = ''

export const GAS_URL_STORAGE_KEY = 'erp-gas-url'

export interface SheetsRuntimeConfig {
    spreadsheetId: string
    issueSheetGid: string
    apiKey: string
    gasUrl: string
}

/** Плоский ответ GAS: один и тот же конверт на все действия. */
export interface GasResponse {
    ok?: boolean
    badges?: string[]
    entries?: ErpIssuedBadgeEntry[]
    packingEntries?: ErpPackingEntry[]
    error?: string
    fio?: string
    department?: string
    position?: string
    platform?: string
    role?: string
    login?: string
    password?: string
    access?: ErpAccessFlags
    departments?: ErpPersonnelDepartment[]
    platforms?: string[]
    rights?: ErpPersonnelRight[]
    employees?: ErpPersonnelRow[]
    employee?: ErpPersonnelEmployee
}

export interface ErpLoginProfile {
    fio: string
    department: string
    position: string
    platform: string
    role: string
    login: string
    password?: string
    access: ErpAccessFlags
}

export interface PersonnelActor {
    login: string
    password: string
}

export function getConfig(): SheetsRuntimeConfig {
    const config = useRuntimeConfig()
    const envGasUrl = config.public.erpGasUrl || ''
    const storedGasUrl = import.meta.client ? localStorage.getItem(GAS_URL_STORAGE_KEY) || '' : ''

    return {
        spreadsheetId: config.public.erpSpreadsheetId || '',
        issueSheetGid: config.public.erpIssueSheetGid || '',
        apiKey: config.public.erpSheetsApiKey || '',
        gasUrl: envGasUrl || storedGasUrl,
    }
}

/** Публичное демо без бэкенда заказчика (GitHub Pages / локальный preview). */
export function isErpDemoMode(): boolean {
    return Boolean(useRuntimeConfig().public.erpDemoMode)
}

export function isSheetsApiConfigured(config: SheetsRuntimeConfig): boolean {
    return Boolean(config.spreadsheetId && config.apiKey)
}

export function isGasConfigured(config: SheetsRuntimeConfig): boolean {
    return Boolean(config.gasUrl)
}

export function buildGasUrl(config: SheetsRuntimeConfig, params: Record<string, string>): string {
    const url = new URL(config.gasUrl)
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
    }
    return url.toString()
}

export async function requestGas(config: SheetsRuntimeConfig, params: Record<string, string>): Promise<GasResponse> {
    let response: Response

    try {
        response = await fetch(buildGasUrl(config, params))
    } catch {
        throw new Error('Нет связи с сервером. Проверьте интернет и повторите.')
    }

    if (!response.ok) {
        throw new Error('Ошибка связи с Google Таблицей')
    }

    try {
        return await response.json() as GasResponse
    } catch {
        throw new Error('Неверный ответ от сервера.')
    }
}

export async function requestGasPost(config: SheetsRuntimeConfig, payload: Record<string, unknown>): Promise<GasResponse> {
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

    if (!response.ok) {
        throw new Error('Ошибка связи с Google Таблицей')
    }

    try {
        return await response.json() as GasResponse
    } catch {
        throw new Error('Неверный ответ от сервера. Обновите страницу и попробуйте снова.')
    }
}
