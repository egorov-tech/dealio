<?php
declare(strict_types=1);

require_once __DIR__ . '/src/Bootstrap.php';

$requestId = erp_request_id();

try {
    $config = erp_load_config();
    $pdo = erp_database($config);
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = preg_replace('#^/api#', '', $uri) ?: '/';
    $route = erp_route($method, $path);

    if ($route === null) {
        erp_json(404, erp_error_payload('not_found', 'Не найдено', $requestId));
    }

    $name = $route[0];
    if ($name === 'auth_login') {
        erp_auth_login($pdo, $config, $requestId);
    }
    if ($name === 'auth_logout') {
        erp_auth_logout($pdo, $config, $requestId);
    }
    if ($name === 'auth_me') {
        erp_auth_me($pdo, $config, $requestId);
    }
    if ($name === 'warehouse_categories') {
        erp_warehouse_categories($pdo, $config, $requestId);
    }
    if ($name === 'warehouse_platforms') {
        erp_warehouse_platforms($pdo, $config, $requestId);
    }
    if ($name === 'warehouse_items') {
        erp_warehouse_items($pdo, $config, $requestId);
    }
    if ($name === 'warehouse_stock') {
        erp_warehouse_stock($pdo, $config, $requestId);
    }
    if ($name === 'warehouse_receive') {
        erp_warehouse_receive($pdo, $config, $requestId);
    }
    if ($name === 'warehouse_issue') {
        erp_warehouse_issue($pdo, $config, $requestId);
    }
    if ($name === 'supply_requests') {
        erp_supply_requests($pdo, $config, $requestId);
    }
    if ($name === 'supply_my_requests') {
        erp_supply_my_requests($pdo, $config, $requestId);
    }
    if ($name === 'supply_catalog') {
        erp_supply_catalog($pdo, $config, $requestId);
    }
    if ($name === 'supply_create') {
        erp_supply_create($pdo, $config, $requestId);
    }
    if ($name === 'supply_work_form') {
        erp_supply_work_form($pdo, $config, $requestId);
    }
    if ($name === 'supply_work_requests_queue') {
        erp_supply_work_requests_queue($pdo, $config, $requestId);
    }
    if ($name === 'supply_work_create_invoice') {
        erp_supply_work_create_invoice($pdo, $config, $requestId);
    }
    if ($name === 'supply_work_invoices') {
        erp_supply_work_invoices($pdo, $config, $requestId);
    }
    if ($name === 'supply_work_invoice_file') {
        erp_supply_work_invoice_file($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'supply_work_create_item') {
        erp_supply_work_create_item($pdo, $config, $requestId);
    }
    if ($name === 'supply_work_update_item') {
        erp_supply_work_update_item($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'supply_work_delete_item') {
        erp_supply_work_delete_item($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'supply_work_item_stock') {
        erp_supply_work_item_stock($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'intake_form') {
        erp_intake_form($pdo, $config, $requestId);
    }
    if ($name === 'intake_create_delivery') {
        erp_intake_create_delivery($pdo, $config, $requestId);
    }
    if ($name === 'intake_objects_options') {
        erp_intake_objects_options($pdo, $config, $requestId);
    }
    if ($name === 'intake_complete_matched') {
        erp_intake_complete_matched($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'intake_complete_unmatched') {
        erp_intake_complete_unmatched($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'pto_contracts') {
        erp_pto_contracts($pdo, $config, $requestId);
    }
    if ($name === 'pto_rate_params') {
        erp_pto_rate_params($pdo, $config, $requestId);
    }
    if ($name === 'ed_list') {
        erp_ed_list($pdo, $config, $requestId);
    }
    if ($name === 'ed_create') {
        erp_ed_create($pdo, $config, $requestId);
    }
    if ($name === 'ed_update') {
        erp_ed_update($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'ed_delete') {
        erp_ed_delete($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'ks_list') {
        erp_ks_list($pdo, $config, $requestId);
    }
    if ($name === 'ks_create') {
        erp_ks_create($pdo, $config, $requestId);
    }
    if ($name === 'ks_update') {
        erp_ks_update($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'ks_delete') {
        erp_ks_delete($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'work_statements_list') {
        erp_work_statements_list($pdo, $config, $requestId);
    }
    if ($name === 'work_statement_create') {
        erp_work_statement_create($pdo, $config, $requestId);
    }
    if ($name === 'work_statement_update') {
        erp_work_statement_update($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'work_statement_delete') {
        erp_work_statement_delete($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'pto_notify_status_cron') {
        erp_pto_notify_status_cron($pdo, $config, $requestId);
    }
    if ($name === 'work_log_create') {
        erp_work_log_create($pdo, $config, $requestId);
    }
    if ($name === 'work_log_today') {
        erp_work_log_today($pdo, $config, $requestId);
    }
    if ($name === 'contracts_list') {
        erp_contracts_list($pdo, $config, $requestId);
    }
    if ($name === 'contract_create') {
        erp_contract_create($pdo, $config, $requestId);
    }
    if ($name === 'contract_show') {
        erp_contract_show($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'contract_save_rates') {
        erp_contract_save_rates($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'reports_current') {
        erp_reports_current($pdo, $config, $requestId);
    }
    if ($name === 'reports_ks_current') {
        erp_reports_ks_current($pdo, $config, $requestId);
    }
    if ($name === 'reports_id_current') {
        erp_reports_id_current($pdo, $config, $requestId);
    }
    if ($name === 'approvals_current') {
        erp_approvals_current($pdo, $config, $requestId);
    }
    if ($name === 'approvals_decide') {
        erp_approvals_decide($pdo, $config, $requestId);
    }
    if ($name === 'push_vapid_key') {
        erp_push_vapid_public($pdo, $config, $requestId);
    }
    if ($name === 'push_subscribe') {
        erp_push_subscribe($pdo, $config, $requestId);
    }
    if ($name === 'push_unsubscribe') {
        erp_push_unsubscribe($pdo, $config, $requestId);
    }
    if ($name === 'push_delivered') {
        erp_push_confirm_delivery($pdo, $config, $requestId);
    }
    if ($name === 'push_notify_cron') {
        erp_push_notify_cron($pdo, $config, $requestId);
    }
    if ($name === 'approvals_notify_status_cron') {
        erp_approvals_notify_status_cron($pdo, $config, $requestId);
    }
    if ($name === 'approvals_notify_all_cron') {
        erp_approvals_notify_all_cron($pdo, $config, $requestId);
    }
    if ($name === 'supply_notify_status_cron') {
        erp_supply_notify_status_cron($pdo, $config, $requestId);
    }
    if ($name === 'approvals_notifications') {
        erp_approvals_notifications_current($pdo, $config, $requestId);
    }
    if ($name === 'approvals_notifications_read') {
        erp_approvals_notifications_mark_read($pdo, $config, $requestId);
    }
    if ($name === 'personnel_departments') {
        erp_personnel_departments($pdo, $config, $requestId);
    }
    if ($name === 'personnel_employees') {
        erp_personnel_employees($pdo, $config, $requestId);
    }
    if ($name === 'personnel_employee') {
        erp_personnel_employee($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'personnel_create') {
        erp_personnel_create($pdo, $config, $requestId);
    }
    if ($name === 'personnel_save') {
        erp_personnel_save($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'personnel_dismiss') {
        erp_personnel_dismiss($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'badges_list') {
        erp_badges_list($pdo, $config, $requestId);
    }
    if ($name === 'badges_issue') {
        erp_badges_issue($pdo, $config, $requestId);
    }
    if ($name === 'badges_issues_today') {
        erp_badges_issues_today($pdo, $config, $requestId);
    }
    if ($name === 'badges_delete_issue') {
        erp_badges_delete_issue($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }
    if ($name === 'handover_create') {
        erp_handover_create($pdo, $config, $requestId);
    }
    if ($name === 'handover_today') {
        erp_handover_today($pdo, $config, $requestId);
    }
    if ($name === 'handover_undo') {
        erp_handover_undo($pdo, $config, $requestId, (int) ($route[1] ?? 0));
    }

    erp_json(501, erp_error_payload('not_implemented', 'Функция временно недоступна', $requestId));
} catch (Throwable $error) {
    error_log('ERP API [' . $requestId . ']: ' . $error->getMessage());
    erp_json(500, erp_error_payload('internal_error', 'ERP временно недоступна. Повторите попытку.', $requestId));
}
