<?php
declare(strict_types=1);

/**
 * @return array{0:string,1?:int}|null
 */
function erp_route(string $method, string $path): ?array
{
    if ($method === 'POST' && $path === '/auth/login') {
        return ['auth_login'];
    }
    if ($method === 'POST' && $path === '/auth/logout') {
        return ['auth_logout'];
    }
    if ($method === 'GET' && $path === '/warehouse/categories') {
        return ['warehouse_categories'];
    }
    if ($method === 'GET' && $path === '/warehouse/platforms') {
        return ['warehouse_platforms'];
    }
    if ($method === 'GET' && $path === '/warehouse/items') {
        return ['warehouse_items'];
    }
    if ($method === 'GET' && $path === '/warehouse/stock') {
        return ['warehouse_stock'];
    }
    if ($method === 'POST' && $path === '/warehouse/receive') {
        return ['warehouse_receive'];
    }
    if ($method === 'POST' && $path === '/warehouse/issue') {
        return ['warehouse_issue'];
    }
    if ($method === 'GET' && $path === '/supply/requests') {
        return ['supply_requests'];
    }
    if ($method === 'GET' && $path === '/supply/my-requests') {
        return ['supply_my_requests'];
    }
    if ($method === 'GET' && $path === '/supply/catalog') {
        return ['supply_catalog'];
    }
    if ($method === 'POST' && $path === '/supply/requests') {
        return ['supply_create'];
    }
    if ($method === 'GET' && $path === '/supply-work/form') {
        return ['supply_work_form'];
    }
    if ($method === 'GET' && $path === '/supply-work/requests-queue') {
        return ['supply_work_requests_queue'];
    }
    if ($method === 'POST' && $path === '/supply-work/invoices') {
        return ['supply_work_create_invoice'];
    }
    if ($method === 'GET' && $path === '/supply-work/invoices') {
        return ['supply_work_invoices'];
    }
    if ($method === 'GET' && preg_match('#^/supply-work/invoices/(\d+)/file$#', $path, $m) === 1) {
        return ['supply_work_invoice_file', $m[1]];
    }
    if ($method === 'POST' && $path === '/supply-work/items') {
        return ['supply_work_create_item'];
    }
    if ($method === 'POST' && preg_match('#^/supply-work/items/(\d+)$#', $path, $m) === 1) {
        return ['supply_work_update_item', $m[1]];
    }
    if ($method === 'DELETE' && preg_match('#^/supply-work/items/(\d+)$#', $path, $m) === 1) {
        return ['supply_work_delete_item', $m[1]];
    }
    if ($method === 'GET' && preg_match('#^/supply-work/items/(\d+)/stock$#', $path, $m) === 1) {
        return ['supply_work_item_stock', $m[1]];
    }
    if ($method === 'GET' && $path === '/intake/form') {
        return ['intake_form'];
    }
    if ($method === 'POST' && $path === '/intake/deliveries') {
        return ['intake_create_delivery'];
    }
    if ($method === 'GET' && $path === '/intake/objects') {
        return ['intake_objects_options'];
    }
    if ($method === 'POST' && preg_match('#^/intake/deliveries/(\d+)/objects$#', $path, $m) === 1) {
        return ['intake_complete_matched', $m[1]];
    }
    if ($method === 'POST' && preg_match('#^/intake/deliveries/(\d+)/unmatched$#', $path, $m) === 1) {
        return ['intake_complete_unmatched', $m[1]];
    }
    if ($method === 'GET' && $path === '/pto/contracts') {
        return ['pto_contracts'];
    }
    if ($method === 'GET' && $path === '/pto/rate-params') {
        return ['pto_rate_params'];
    }
    if ($method === 'GET' && $path === '/pto/ed') {
        return ['ed_list'];
    }
    if ($method === 'POST' && $path === '/pto/ed') {
        return ['ed_create'];
    }
    if ($method === 'POST' && preg_match('#^/pto/ed/(\d+)$#', $path, $m) === 1) {
        return ['ed_update', $m[1]];
    }
    if ($method === 'DELETE' && preg_match('#^/pto/ed/(\d+)$#', $path, $m) === 1) {
        return ['ed_delete', $m[1]];
    }
    if ($method === 'GET' && $path === '/pto/ks') {
        return ['ks_list'];
    }
    if ($method === 'POST' && $path === '/pto/ks') {
        return ['ks_create'];
    }
    if ($method === 'POST' && preg_match('#^/pto/ks/(\d+)$#', $path, $m) === 1) {
        return ['ks_update', $m[1]];
    }
    if ($method === 'DELETE' && preg_match('#^/pto/ks/(\d+)$#', $path, $m) === 1) {
        return ['ks_delete', $m[1]];
    }
    if ($method === 'GET' && $path === '/pto/work-statements') {
        return ['work_statements_list'];
    }
    if ($method === 'POST' && $path === '/pto/work-statements') {
        return ['work_statement_create'];
    }
    if ($method === 'POST' && preg_match('#^/pto/work-statements/(\d+)$#', $path, $m) === 1) {
        return ['work_statement_update', $m[1]];
    }
    if ($method === 'DELETE' && preg_match('#^/pto/work-statements/(\d+)$#', $path, $m) === 1) {
        return ['work_statement_delete', $m[1]];
    }
    if ($method === 'POST' && $path === '/internal/pto-notify-status') {
        return ['pto_notify_status_cron'];
    }
    if ($method === 'POST' && $path === '/work-log') {
        return ['work_log_create'];
    }
    if ($method === 'GET' && $path === '/work-log/today') {
        return ['work_log_today'];
    }
    if ($method === 'GET' && $path === '/contracts') {
        return ['contracts_list'];
    }
    if ($method === 'POST' && $path === '/contracts') {
        return ['contract_create'];
    }
    if ($method === 'GET' && preg_match('#^/contracts/(\d+)$#', $path, $m) === 1) {
        return ['contract_show', $m[1]];
    }
    if ($method === 'POST' && preg_match('#^/contracts/(\d+)/rates$#', $path, $m) === 1) {
        return ['contract_save_rates', $m[1]];
    }
    if ($method === 'GET' && $path === '/auth/me') {
        return ['auth_me'];
    }
    if ($method === 'GET' && $path === '/reports/current') {
        return ['reports_current'];
    }
    if ($method === 'GET' && $path === '/reports/ks') {
        return ['reports_ks_current'];
    }
    if ($method === 'GET' && $path === '/reports/id') {
        return ['reports_id_current'];
    }
    if ($method === 'GET' && $path === '/approvals') {
        return ['approvals_current'];
    }
    if ($method === 'POST' && $path === '/approvals/decisions') {
        return ['approvals_decide'];
    }
    if ($method === 'GET' && $path === '/push/vapid-key') {
        return ['push_vapid_key'];
    }
    if ($method === 'POST' && $path === '/push/subscribe') {
        return ['push_subscribe'];
    }
    if ($method === 'POST' && $path === '/push/unsubscribe') {
        return ['push_unsubscribe'];
    }
    // Подтверждение показа уведомления. Без сессии намеренно: приходит из
    // service worker, который переживает истёкший вход. Право — одноразовый
    // токен внутри самого уведомления.
    if ($method === 'POST' && $path === '/push/delivered') {
        return ['push_delivered'];
    }
    if ($method === 'POST' && $path === '/internal/push-notify') {
        return ['push_notify_cron'];
    }
    if ($method === 'POST' && $path === '/internal/approvals-notify-status') {
        return ['approvals_notify_status_cron'];
    }
    if ($method === 'POST' && $path === '/internal/approvals-notify-all') {
        return ['approvals_notify_all_cron'];
    }
    if ($method === 'POST' && $path === '/internal/supply-notify-status') {
        return ['supply_notify_status_cron'];
    }
    if ($method === 'GET' && $path === '/approvals/notifications') {
        return ['approvals_notifications'];
    }
    if ($method === 'POST' && $path === '/approvals/notifications/read') {
        return ['approvals_notifications_read'];
    }
    if ($method === 'GET' && $path === '/personnel/departments') {
        return ['personnel_departments'];
    }
    if ($method === 'GET' && $path === '/personnel/employees') {
        return ['personnel_employees'];
    }
    if ($method === 'GET' && preg_match('#^/personnel/employees/(\d+)$#', $path, $matches) === 1) {
        return ['personnel_employee', (int) $matches[1]];
    }
    if ($method === 'POST' && $path === '/personnel/employees') {
        return ['personnel_create'];
    }
    if ($method === 'PATCH' && preg_match('#^/personnel/employees/(\d+)$#', $path, $matches) === 1) {
        return ['personnel_save', (int) $matches[1]];
    }
    if ($method === 'POST' && preg_match('#^/personnel/employees/(\d+)/dismiss$#', $path, $matches) === 1) {
        return ['personnel_dismiss', (int) $matches[1]];
    }
    if ($method === 'GET' && $path === '/badges') {
        return ['badges_list'];
    }
    if ($method === 'POST' && $path === '/badges/issues') {
        return ['badges_issue'];
    }
    if ($method === 'GET' && $path === '/badges/issues/today') {
        return ['badges_issues_today'];
    }
    if ($method === 'DELETE' && preg_match('#^/badges/issues/(\d+)$#', $path, $matches) === 1) {
        return ['badges_delete_issue', (int) $matches[1]];
    }
    if ($method === 'POST' && $path === '/handover/entries') {
        return ['handover_create'];
    }
    if ($method === 'GET' && $path === '/handover/entries/today') {
        return ['handover_today'];
    }
    if ($method === 'DELETE' && preg_match('#^/handover/entries/(\d+)$#', $path, $matches) === 1) {
        return ['handover_undo', (int) $matches[1]];
    }

    return null;
}
