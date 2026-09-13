<?php
declare(strict_types=1);

$pto = dirname(__DIR__, 2) . '/public/api/src/Pto.php';
if (!is_file($pto)) {
    fwrite(STDERR, "Pto API adapter is missing\n");
    exit(1);
}

require $pto;

function expect_pto(bool $actual, string $message): void
{
    if (!$actual) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

// Списки статусов — ровно то, что задано в ТЗ, ни больше ни меньше: лишний
// или пропущенный статус либо запрещает законное значение, либо пропускает
// то, чего в сценарии нет.
expect_pto(count(ERP_ED_STATUSES) === 11, 'ED status list must have exactly 11 values from the spec');
foreach ([
    'Устранение замечаний', 'На проверке ГСП', 'На проверке СК', 'Не хватает Инспекций',
    'Не хватает АВК', 'Согласована', 'Подписана', 'Нет ПОЗ', 'Подготовка', 'Забрал ВЛС',
    'Гарантийный объём',
] as $status) {
    expect_pto(in_array($status, ERP_ED_STATUSES, true), "ED status list must contain '{$status}'");
}
expect_pto(ERP_KS_STATUSES === ['Подписана', 'Согласована'], 'KS status list must be exactly Подписана/Согласована');

// Пустое значение — «не заполнено», а не ноль: ноль в объёме или стоимости
// выглядит как настоящее значение.
expect_pto(erp_pto_nullable_number(null) === null, 'Null input must stay null');
expect_pto(erp_pto_nullable_number('') === null, 'Blank string must normalize to null, not zero');
expect_pto(erp_pto_nullable_number('   ') === null, 'Whitespace-only string must normalize to null');
expect_pto(erp_pto_nullable_number('0') === 0.0, 'Explicit zero must be kept as zero, not treated as blank');
expect_pto(erp_pto_nullable_number('12,5') === 12.5, 'Comma decimal separator must be normalized');
expect_pto(erp_pto_nullable_number('abc') === null, 'Non-numeric input must not crash — falls back to null');

// Форма строки для клиента: camelCase-ключи, числовые NULL остаются null (не
// приводятся к 0), а не числовые поля идут строками даже при пустом значении.
$edRow = erp_ed_row([
    'id' => 1, 'contract_internal_number' => 'Д-101', 'aosr' => 'АО-1', 'title' => 'Титул',
    'volume' => null, 'cost' => '12345.50', 'status' => 'Подготовка',
]);
expect_pto($edRow['contractInternalNumber'] === 'Д-101', 'ED row must expose contractInternalNumber');
expect_pto($edRow['volume'] === null, 'ED row must keep an unset volume as null, not 0');
expect_pto($edRow['cost'] === 12345.5, 'ED row must cast a numeric string cost to float');

$ksRow = erp_ks_row([
    'id' => 2, 'contract_internal_number' => 'Д-101', 'number' => '1', 'cost' => null, 'status' => 'Подписана',
]);
expect_pto($ksRow['cost'] === null, 'KS row must keep an unset cost as null');

$wrRow = erp_work_statement_row([
    'id' => 3, 'contract_internal_number' => 'Д-101', 'work_description' => 'Огнезащита',
    'tag' => 'T1', 'material' => 'ОЗ-1', 'thickness' => '450', 'fire_resistance' => 'EI 45',
    'theoretical_consumption' => null, 'param1' => 'T1', 'param2' => 'EI 45',
]);
expect_pto($wrRow['workDescription'] === 'Огнезащита', 'Work statement row must expose workDescription');
expect_pto($wrRow['thickness'] === 450.0, 'Work statement row must cast thickness to float');
expect_pto($wrRow['theoreticalConsumption'] === null, 'Work statement row must keep unset consumption as null');

echo "Pto PHP tests passed\n";
