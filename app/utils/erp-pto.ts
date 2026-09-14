import {erpApiRequest} from '~/utils/erp-api'

/**
 * Раздел «ПТО»: исполнительная документация (ИД), акты форм КС и ведомость
 * работ (ВР) — записи, которые отдел ведёт сам в MySQL. Не путать с «КС»/«ИД»
 * внутри «Отчётов» (erp-sheets.ts): те читают внешнюю Google-таблицу только
 * на просмотр сводки руководству и с этими записями не связаны.
 */

/** Договор для выбора в формах ПТО — без права «Работа с договорами». */
export interface ErpPtoContract {
    internalNumber: string
    contractNumber: string
    customer: string
}

export async function fetchPtoContracts(): Promise<ErpPtoContract[]> {
    const data = await erpApiRequest<{contracts: ErpPtoContract[]}>('pto/contracts')
    return data.contracts ?? []
}

/** Значения param1/param2, которыми уже пользуется договор в расценках. */
export async function fetchPtoRateParams(contractInternalNumber: string): Promise<{param1: string[]; param2: string[]}> {
    if (!contractInternalNumber) return {param1: [], param2: []}
    return erpApiRequest<{param1: string[]; param2: string[]}>(
        `pto/rate-params?contract=${encodeURIComponent(contractInternalNumber)}`,
    )
}

// --- ИД ------------------------------------------------------------------

export interface ErpEdRow {
    id: number
    contractInternalNumber: string
    aosr: string
    title: string
    /** Часть (захватка): DP2, DP4, DP6 — пришла с данными отдела. */
    part: string
    volume: number | null
    cost: number | null
    status: string
}

export type ErpEdInput = Omit<ErpEdRow, 'id'>

export async function fetchEdRows(): Promise<{rows: ErpEdRow[]; statuses: string[]}> {
    const data = await erpApiRequest<{rows: ErpEdRow[]; statuses: string[]}>('pto/ed')
    return {rows: data.rows ?? [], statuses: data.statuses ?? []}
}

export async function createEdRow(input: ErpEdInput): Promise<ErpEdRow> {
    return erpApiRequest<ErpEdRow>('pto/ed', {method: 'POST', body: JSON.stringify(input)})
}

export async function updateEdRow(id: number, input: ErpEdInput): Promise<ErpEdRow> {
    return erpApiRequest<ErpEdRow>(`pto/ed/${id}`, {method: 'POST', body: JSON.stringify(input)})
}

export async function deleteEdRow(id: number): Promise<void> {
    await erpApiRequest(`pto/ed/${id}`, {method: 'DELETE'})
}

// --- КС ------------------------------------------------------------------

export interface ErpKsRecordRow {
    id: number
    contractInternalNumber: string
    number: string
    cost: number | null
    status: string
}

export type ErpKsRecordInput = Omit<ErpKsRecordRow, 'id'>

export async function fetchKsRecordRows(): Promise<{rows: ErpKsRecordRow[]; statuses: string[]}> {
    const data = await erpApiRequest<{rows: ErpKsRecordRow[]; statuses: string[]}>('pto/ks')
    return {rows: data.rows ?? [], statuses: data.statuses ?? []}
}

export async function createKsRecordRow(input: ErpKsRecordInput): Promise<ErpKsRecordRow> {
    return erpApiRequest<ErpKsRecordRow>('pto/ks', {method: 'POST', body: JSON.stringify(input)})
}

export async function updateKsRecordRow(id: number, input: ErpKsRecordInput): Promise<ErpKsRecordRow> {
    return erpApiRequest<ErpKsRecordRow>(`pto/ks/${id}`, {method: 'POST', body: JSON.stringify(input)})
}

export async function deleteKsRecordRow(id: number): Promise<void> {
    await erpApiRequest(`pto/ks/${id}`, {method: 'DELETE'})
}

// --- ВР ------------------------------------------------------------------

export interface ErpWorkStatementRow {
    id: number
    contractInternalNumber: string
    workDescription: string
    tag: string
    material: string
    thickness: number | null
    fireResistance: string
    theoreticalConsumption: number | null
    param1: string
    param2: string
}

export type ErpWorkStatementInput = Omit<ErpWorkStatementRow, 'id'>

export async function fetchWorkStatementRows(): Promise<ErpWorkStatementRow[]> {
    const data = await erpApiRequest<{rows: ErpWorkStatementRow[]}>('pto/work-statements')
    return data.rows ?? []
}

export async function createWorkStatementRow(input: ErpWorkStatementInput): Promise<ErpWorkStatementRow> {
    return erpApiRequest<ErpWorkStatementRow>('pto/work-statements', {method: 'POST', body: JSON.stringify(input)})
}

export async function updateWorkStatementRow(id: number, input: ErpWorkStatementInput): Promise<ErpWorkStatementRow> {
    return erpApiRequest<ErpWorkStatementRow>(`pto/work-statements/${id}`, {method: 'POST', body: JSON.stringify(input)})
}

export async function deleteWorkStatementRow(id: number): Promise<void> {
    await erpApiRequest(`pto/work-statements/${id}`, {method: 'DELETE'})
}
