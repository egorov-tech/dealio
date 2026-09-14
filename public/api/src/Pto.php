<?php
declare(strict_types=1);

/**
 * Раздел «ПТО»: исполнительная документация (ИД), акты форм КС и ведомость
 * работ (ВР) — три таблицы, которые отдел ведёт сам, без стороннего
 * источника. Не путать с «Отчётами» (public/api/src/Reports.php): там КС и
 * ИД — только витрина сводки руководству из внешней Google-таблицы; здесь —
 * первичный учёт, ради которого ту сводку вообще можно свести.
 */

const ERP_ED_STATUSES = [
    'Устранение замечаний',
    'На проверке ГСП',
    'На проверке СК',
    'Не хватает Инспекций',
    'Не хватает АВК',
    'Согласована',
    'Подписана',
    'Нет ПОЗ',
    'Подготовка',
    'Забрал ВЛС',
    'Гарантийный объём',
];

const ERP_KS_STATUSES = ['Подписана', 'Согласована'];

/** Сотрудники ПТО — тем же фильтром, что «Приход» и ведомость работ (022):
 * department — свободный текст без справочника, часть карточек завела отдел
 * иначе, а должность «Инженер ПТО» — нет.
 */
function erp_pto_user_ids(PDO $pdo): array
{
    $rows = $pdo->query(
        "SELECT id FROM erp_users WHERE (department = 'ПТО' OR position LIKE '%ПТО%') AND status = 'Работает'"
    )->fetchAll(PDO::FETCH_COLUMN);
    return array_map('intval', $rows);
}

/** Договор существует — иначе внешний ключ уронит запрос неотличимой от
 * прочих ошибок 500-кой, а пользователь мог просто опечататься в номере.
 */
function erp_pto_require_contract(PDO $pdo, string $internalNumber, string $requestId): void
{
    $stmt = $pdo->prepare('SELECT 1 FROM erp_contracts WHERE internal_number = :n');
    $stmt->execute(['n' => $internalNumber]);
    if (!$stmt->fetchColumn()) {
        erp_json(404, erp_error_payload('not_found', 'Договор не найден', $requestId));
    }
}

/** Список договоров для выбора в формах ПТО — не требует права «contracts»:
 * ПТО договоры не редактирует, только ссылается на них по номеру.
 */
function erp_pto_contracts(PDO $pdo, array $config, string $requestId): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $rows = $pdo->query(
        'SELECT internal_number, contract_number, customer FROM erp_contracts ORDER BY internal_number'
    )->fetchAll(PDO::FETCH_ASSOC);

    $contracts = array_map(static fn (array $row): array => [
        'internalNumber' => (string) $row['internal_number'],
        'contractNumber' => (string) $row['contract_number'],
        'customer' => (string) $row['customer'],
    ], $rows);

    erp_json(200, ['ok' => true, 'data' => ['contracts' => $contracts]]);
}

/** Значения param1/param2, которыми уже пользуется договор в расценках —
 * сверка для ведомости работ: не жёсткая проверка (расценки на договор могут
 * быть ещё не заведены), а подсказка выбрать то же значение, а не опечатать
 * своё.
 */
function erp_pto_rate_params(PDO $pdo, array $config, string $requestId): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $internalNumber = trim((string) ($_GET['contract'] ?? ''));
    if ($internalNumber === '') {
        erp_json(200, ['ok' => true, 'data' => ['param1' => [], 'param2' => []]]);
    }

    $stmt = $pdo->prepare(
        'SELECT DISTINCT param1, param2 FROM erp_contract_rates WHERE internal_number = :n'
    );
    $stmt->execute(['n' => $internalNumber]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $param1 = [];
    $param2 = [];
    foreach ($rows as $row) {
        $p1 = trim((string) $row['param1']);
        $p2 = trim((string) $row['param2']);
        if ($p1 !== '' && !in_array($p1, $param1, true)) $param1[] = $p1;
        if ($p2 !== '' && !in_array($p2, $param2, true)) $param2[] = $p2;
    }

    erp_json(200, ['ok' => true, 'data' => ['param1' => $param1, 'param2' => $param2]]);
}

// ---------------------------------------------------------------------
// ИД — исполнительная документация
// ---------------------------------------------------------------------

function erp_ed_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'contractInternalNumber' => (string) $row['contract_internal_number'],
        'aosr' => (string) $row['aosr'],
        'title' => (string) $row['title'],
        'part' => (string) ($row['part'] ?? ''),
        'volume' => $row['volume'] !== null ? (float) $row['volume'] : null,
        'cost' => $row['cost'] !== null ? (float) $row['cost'] : null,
        'status' => (string) $row['status'],
    ];
}

function erp_ed_input(PDO $pdo, string $requestId): array
{
    $input = erp_warehouse_input($requestId);

    $contract = trim((string) ($input['contractInternalNumber'] ?? ''));
    $status = trim((string) ($input['status'] ?? ''));
    if ($contract === '') {
        erp_json(422, erp_error_payload('invalid_input', 'Укажите договор', $requestId));
    }
    if (!in_array($status, erp_ed_statuses($pdo), true)) {
        erp_json(422, erp_error_payload('invalid_input', 'Укажите статус из списка', $requestId));
    }
    erp_pto_require_contract($pdo, $contract, $requestId);

    $aosr = trim((string) ($input['aosr'] ?? ''));
    $title = trim((string) ($input['title'] ?? ''));
    $part = trim((string) ($input['part'] ?? ''));
    if (mb_strlen($aosr) > 255 || mb_strlen($title) > 255 || mb_strlen($part) > 64) {
        erp_json(422, erp_error_payload('invalid_input', 'Слишком длинное значение', $requestId));
    }

    return [
        'contract_internal_number' => $contract,
        'aosr' => $aosr,
        'title' => $title,
        'part' => $part,
        'volume' => erp_pto_nullable_number($input['volume'] ?? null),
        'cost' => erp_pto_nullable_number($input['cost'] ?? null),
        'status' => $status,
    ];
}

/** Справочник статусов из ТЗ плюс те, что уже лежат в данных.
 *
 * Перенесённые строки принесли значения за пределами списка — у КС это
 * «На согласовании». Оставь мы только список ТЗ, такую запись нельзя было бы
 * сохранить даже после правки одной лишь суммы: валидация отклонила бы её
 * собственный, уже существующий статус.
 */
function erp_pto_merge_statuses(array $dictionary, array $used): array
{
    foreach ($used as $status) {
        $status = trim((string) $status);
        if ($status !== '' && !in_array($status, $dictionary, true)) {
            $dictionary[] = $status;
        }
    }
    return $dictionary;
}

function erp_ed_statuses(PDO $pdo): array
{
    return erp_pto_merge_statuses(
        ERP_ED_STATUSES,
        $pdo->query('SELECT DISTINCT status FROM erp_pto_ed')->fetchAll(PDO::FETCH_COLUMN),
    );
}

function erp_ks_statuses(PDO $pdo): array
{
    return erp_pto_merge_statuses(
        ERP_KS_STATUSES,
        $pdo->query('SELECT DISTINCT status FROM erp_pto_ks')->fetchAll(PDO::FETCH_COLUMN),
    );
}

/** Пустая строка/null — «не заполнено», а не ноль: ноль в объёме или
 * стоимости выглядит как настоящее значение, а не как «данных пока нет».
 */
function erp_pto_nullable_number(mixed $raw): ?float
{
    if ($raw === null) return null;
    $normalized = trim(str_replace(',', '.', (string) $raw));
    if ($normalized === '') return null;
    return is_numeric($normalized) ? (float) $normalized : null;
}

function erp_ed_list(PDO $pdo, array $config, string $requestId): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $rows = $pdo->query(
        'SELECT id, contract_internal_number, aosr, title, part, volume, cost, status
         FROM erp_pto_ed ORDER BY id DESC'
    )->fetchAll(PDO::FETCH_ASSOC);

    erp_json(200, ['ok' => true, 'data' => [
        'rows' => array_map('erp_ed_row', $rows),
        'statuses' => erp_ed_statuses($pdo),
    ]]);
}

function erp_ed_create(PDO $pdo, array $config, string $requestId): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $data = erp_ed_input($pdo, $requestId);
    // Новую запись сразу считаем «сообщённой» под её же статус: уведомление —
    // про изменение статуса, а не про то, что запись появилась.
    $data['notified_status'] = $data['status'];
    $data['created_by'] = (int) $actor['id'];

    $pdo->prepare(
        'INSERT INTO erp_pto_ed (contract_internal_number, aosr, title, part, volume, cost, status, notified_status, created_by)
         VALUES (:contract_internal_number, :aosr, :title, :part, :volume, :cost, :status, :notified_status, :created_by)'
    )->execute($data);

    $id = (int) $pdo->lastInsertId();
    erp_json(200, ['ok' => true, 'data' => erp_ed_row($data + ['id' => $id])]);
}

function erp_ed_update(PDO $pdo, array $config, string $requestId, int $id): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $exists = $pdo->prepare('SELECT id FROM erp_pto_ed WHERE id = :id');
    $exists->execute(['id' => $id]);
    if (!$exists->fetchColumn()) {
        erp_json(404, erp_error_payload('not_found', 'Запись ИД не найдена', $requestId));
    }

    $data = erp_ed_input($pdo, $requestId);
    $pdo->prepare(
        'UPDATE erp_pto_ed SET contract_internal_number = :contract_internal_number, aosr = :aosr, title = :title,
             part = :part, volume = :volume, cost = :cost, status = :status
         WHERE id = :id'
    )->execute($data + ['id' => $id]);

    // Мгновенно, не через пять минут крона — тот же приём, что у заявок
    // снабжения и счетов.
    try {
        erp_ed_notify_status_changes($pdo, $config);
    } catch (Throwable) {
        // Запись уже сохранена: непришедшее уведомление — повод посмотреть логи.
    }

    erp_json(200, ['ok' => true, 'data' => erp_ed_row($data + ['id' => $id])]);
}

function erp_ed_delete(PDO $pdo, array $config, string $requestId, int $id): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $stmt = $pdo->prepare('DELETE FROM erp_pto_ed WHERE id = :id');
    $stmt->execute(['id' => $id]);
    if ($stmt->rowCount() === 0) {
        erp_json(404, erp_error_payload('not_found', 'Запись ИД не найдена', $requestId));
    }

    erp_json(200, ['ok' => true, 'data' => ['id' => $id]]);
}

/**
 * Тот же diff-приём, что erp_supply_notify_status_changes /
 * erp_approvals_notify_status_changes: событие — расхождение status <>
 * notified_status, а не вызов из конкретного места, поэтому его ловит и
 * прямой вызов из erp_ed_update, и подстраховочный крон.
 *
 * @return array{changed: int}
 */
function erp_ed_notify_status_changes(PDO $pdo, array $config): array
{
    $changed = $pdo->query(
        "SELECT id, contract_internal_number, aosr, title, status
         FROM erp_pto_ed WHERE status <> notified_status"
    )->fetchAll(PDO::FETCH_ASSOC);

    $markNotified = $pdo->prepare('UPDATE erp_pto_ed SET notified_status = :status WHERE id = :id');
    $recipients = erp_pto_user_ids($pdo);

    foreach ($changed as $row) {
        $label = trim($row['aosr'] . ' ' . $row['title']) ?: ('договор ' . $row['contract_internal_number']);
        if ($recipients !== []) {
            try {
                erp_push_send_to_users(
                    $pdo, $config, $recipients,
                    'ИД: статус изменён', "{$label} → «{$row['status']}»", '/pto-ed',
                );
            } catch (Throwable) {
                // Молча: смена статуса важнее уведомления. Отметку всё равно
                // ставим ниже — иначе один и тот же сбой (например, не
                // настроен push) повторялся бы на каждом прогоне крона, а не
                // только на первом.
            }
        }
        $markNotified->execute(['status' => $row['status'], 'id' => $row['id']]);
    }

    return ['changed' => count($changed)];
}

// ---------------------------------------------------------------------
// КС — акты форм КС
// ---------------------------------------------------------------------

function erp_ks_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'contractInternalNumber' => (string) $row['contract_internal_number'],
        'number' => (string) $row['number'],
        'cost' => $row['cost'] !== null ? (float) $row['cost'] : null,
        'status' => (string) $row['status'],
    ];
}

function erp_ks_input(PDO $pdo, string $requestId): array
{
    $input = erp_warehouse_input($requestId);

    $contract = trim((string) ($input['contractInternalNumber'] ?? ''));
    $status = trim((string) ($input['status'] ?? ''));
    if ($contract === '') {
        erp_json(422, erp_error_payload('invalid_input', 'Укажите договор', $requestId));
    }
    if (!in_array($status, erp_ks_statuses($pdo), true)) {
        erp_json(422, erp_error_payload('invalid_input', 'Укажите статус из списка', $requestId));
    }
    erp_pto_require_contract($pdo, $contract, $requestId);

    $number = trim((string) ($input['number'] ?? ''));
    if (mb_strlen($number) > 64) {
        erp_json(422, erp_error_payload('invalid_input', 'Слишком длинный номер', $requestId));
    }

    return [
        'contract_internal_number' => $contract,
        'number' => $number,
        'cost' => erp_pto_nullable_number($input['cost'] ?? null),
        'status' => $status,
    ];
}

function erp_ks_list(PDO $pdo, array $config, string $requestId): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $rows = $pdo->query(
        'SELECT id, contract_internal_number, number, cost, status FROM erp_pto_ks ORDER BY id DESC'
    )->fetchAll(PDO::FETCH_ASSOC);

    erp_json(200, ['ok' => true, 'data' => [
        'rows' => array_map('erp_ks_row', $rows),
        'statuses' => erp_ks_statuses($pdo),
    ]]);
}

function erp_ks_create(PDO $pdo, array $config, string $requestId): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $data = erp_ks_input($pdo, $requestId);
    $data['notified_status'] = $data['status'];
    $data['created_by'] = (int) $actor['id'];

    $pdo->prepare(
        'INSERT INTO erp_pto_ks (contract_internal_number, number, cost, status, notified_status, created_by)
         VALUES (:contract_internal_number, :number, :cost, :status, :notified_status, :created_by)'
    )->execute($data);

    $id = (int) $pdo->lastInsertId();
    erp_json(200, ['ok' => true, 'data' => erp_ks_row($data + ['id' => $id])]);
}

function erp_ks_update(PDO $pdo, array $config, string $requestId, int $id): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $exists = $pdo->prepare('SELECT id FROM erp_pto_ks WHERE id = :id');
    $exists->execute(['id' => $id]);
    if (!$exists->fetchColumn()) {
        erp_json(404, erp_error_payload('not_found', 'Акт КС не найден', $requestId));
    }

    $data = erp_ks_input($pdo, $requestId);
    $pdo->prepare(
        'UPDATE erp_pto_ks SET contract_internal_number = :contract_internal_number, number = :number,
             cost = :cost, status = :status
         WHERE id = :id'
    )->execute($data + ['id' => $id]);

    try {
        erp_ks_notify_status_changes($pdo, $config);
    } catch (Throwable) {
        // Запись уже сохранена: непришедшее уведомление — повод посмотреть логи.
    }

    erp_json(200, ['ok' => true, 'data' => erp_ks_row($data + ['id' => $id])]);
}

function erp_ks_delete(PDO $pdo, array $config, string $requestId, int $id): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $stmt = $pdo->prepare('DELETE FROM erp_pto_ks WHERE id = :id');
    $stmt->execute(['id' => $id]);
    if ($stmt->rowCount() === 0) {
        erp_json(404, erp_error_payload('not_found', 'Акт КС не найден', $requestId));
    }

    erp_json(200, ['ok' => true, 'data' => ['id' => $id]]);
}

/** @return array{changed: int} */
function erp_ks_notify_status_changes(PDO $pdo, array $config): array
{
    $changed = $pdo->query(
        "SELECT id, contract_internal_number, number, status
         FROM erp_pto_ks WHERE status <> notified_status"
    )->fetchAll(PDO::FETCH_ASSOC);

    $markNotified = $pdo->prepare('UPDATE erp_pto_ks SET notified_status = :status WHERE id = :id');
    $recipients = erp_pto_user_ids($pdo);

    foreach ($changed as $row) {
        $label = 'Договор ' . $row['contract_internal_number'] . ', КС №' . $row['number'];
        if ($recipients !== []) {
            try {
                erp_push_send_to_users(
                    $pdo, $config, $recipients,
                    'КС: статус изменён', "{$label} → «{$row['status']}»", '/pto-ks',
                );
            } catch (Throwable) {
                // Молча: смена статуса важнее уведомления, отметку ставим ниже.
            }
        }
        $markNotified->execute(['status' => $row['status'], 'id' => $row['id']]);
    }

    return ['changed' => count($changed)];
}

/** Подстраховочный крон: erp_ed_update/erp_ks_update уже уведомляют
 * синхронно сразу после своего commit — этот маршрут ловит только случай,
 * когда та отправка не прошла (см. docs/sql-staging-deploy-runbook.md).
 */
function erp_pto_notify_status_cron(PDO $pdo, array $config, string $requestId): void
{
    erp_require_cron_token($config, $requestId);

    $ed = erp_ed_notify_status_changes($pdo, $config);
    $ks = erp_ks_notify_status_changes($pdo, $config);
    erp_json(200, ['ok' => true, 'data' => ['ed' => $ed, 'ks' => $ks]]);
}

// ---------------------------------------------------------------------
// ВР — ведомость работ (таблица заведена в 022, экран — здесь)
// ---------------------------------------------------------------------

function erp_work_statement_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'contractInternalNumber' => (string) $row['contract_internal_number'],
        'workDescription' => (string) $row['work_description'],
        'tag' => (string) $row['tag'],
        'material' => (string) $row['material'],
        'thickness' => $row['thickness'] !== null ? (float) $row['thickness'] : null,
        'fireResistance' => (string) $row['fire_resistance'],
        'theoreticalConsumption' => $row['theoretical_consumption'] !== null ? (float) $row['theoretical_consumption'] : null,
        'param1' => (string) $row['param1'],
        'param2' => (string) $row['param2'],
    ];
}

function erp_work_statement_input(PDO $pdo, string $requestId): array
{
    $input = erp_warehouse_input($requestId);

    $contract = trim((string) ($input['contractInternalNumber'] ?? ''));
    if ($contract === '') {
        erp_json(422, erp_error_payload('invalid_input', 'Укажите договор', $requestId));
    }
    erp_pto_require_contract($pdo, $contract, $requestId);

    $description = trim((string) ($input['workDescription'] ?? ''));

    return [
        'contract_internal_number' => $contract,
        'work_description' => $description,
        'tag' => trim((string) ($input['tag'] ?? '')),
        'material' => trim((string) ($input['material'] ?? '')),
        'thickness' => erp_pto_nullable_number($input['thickness'] ?? null),
        'fire_resistance' => trim((string) ($input['fireResistance'] ?? '')),
        'theoretical_consumption' => erp_pto_nullable_number($input['theoreticalConsumption'] ?? null),
        'param1' => trim((string) ($input['param1'] ?? '')),
        'param2' => trim((string) ($input['param2'] ?? '')),
    ];
}

function erp_work_statements_list(PDO $pdo, array $config, string $requestId): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $rows = $pdo->query(
        'SELECT id, contract_internal_number, work_description, tag, material, thickness,
                fire_resistance, theoretical_consumption, param1, param2
         FROM erp_work_statements ORDER BY id DESC'
    )->fetchAll(PDO::FETCH_ASSOC);

    erp_json(200, ['ok' => true, 'data' => ['rows' => array_map('erp_work_statement_row', $rows)]]);
}

function erp_work_statement_create(PDO $pdo, array $config, string $requestId): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $data = erp_work_statement_input($pdo, $requestId);
    $pdo->prepare(
        'INSERT INTO erp_work_statements
            (contract_internal_number, work_description, tag, material, thickness,
             fire_resistance, theoretical_consumption, param1, param2)
         VALUES
            (:contract_internal_number, :work_description, :tag, :material, :thickness,
             :fire_resistance, :theoretical_consumption, :param1, :param2)'
    )->execute($data);

    $id = (int) $pdo->lastInsertId();
    erp_json(200, ['ok' => true, 'data' => erp_work_statement_row($data + ['id' => $id])]);
}

function erp_work_statement_update(PDO $pdo, array $config, string $requestId, int $id): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $exists = $pdo->prepare('SELECT id FROM erp_work_statements WHERE id = :id');
    $exists->execute(['id' => $id]);
    if (!$exists->fetchColumn()) {
        erp_json(404, erp_error_payload('not_found', 'Строка ведомости не найдена', $requestId));
    }

    $data = erp_work_statement_input($pdo, $requestId);
    $pdo->prepare(
        'UPDATE erp_work_statements SET
             contract_internal_number = :contract_internal_number, work_description = :work_description,
             tag = :tag, material = :material, thickness = :thickness, fire_resistance = :fire_resistance,
             theoretical_consumption = :theoretical_consumption, param1 = :param1, param2 = :param2
         WHERE id = :id'
    )->execute($data + ['id' => $id]);

    erp_json(200, ['ok' => true, 'data' => erp_work_statement_row($data + ['id' => $id])]);
}

function erp_work_statement_delete(PDO $pdo, array $config, string $requestId, int $id): void
{
    $actor = erp_require_user($pdo, $config, $requestId);
    erp_require_permission($pdo, $actor, 'project_data', $requestId);

    $stmt = $pdo->prepare('DELETE FROM erp_work_statements WHERE id = :id');
    $stmt->execute(['id' => $id]);
    if ($stmt->rowCount() === 0) {
        erp_json(404, erp_error_payload('not_found', 'Строка ведомости не найдена', $requestId));
    }

    erp_json(200, ['ok' => true, 'data' => ['id' => $id]]);
}
