<?php
declare(strict_types=1);

// Рассылка сотрудникам ПТО, у чьих записей ИД/КС сменился статус.
// erp_ed_update/erp_ks_update уже уведомляют сразу после своего commit — этот
// скрипт ловит только случай, когда та отправка не прошла (см. тот же приём
// у scripts/supply-notify-status.php).
require_once __DIR__ . '/erp-cli-paths.php';

require_once erp_cli_api_src() . '/Bootstrap.php';

try {
    $config = erp_load_config();
    $pdo = erp_database($config);
    $summary = [
        'ed' => erp_ed_notify_status_changes($pdo, $config),
        'ks' => erp_ks_notify_status_changes($pdo, $config),
    ];
    fwrite(STDOUT, json_encode($summary, JSON_UNESCAPED_UNICODE) . PHP_EOL);
    exit(0);
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
