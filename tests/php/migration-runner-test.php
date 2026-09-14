<?php
declare(strict_types=1);

$migrations = dirname(__DIR__, 2) . '/public/api/src/Migrations.php';
if (!is_file($migrations)) {
    fwrite(STDERR, "Migration runner helper is missing\n");
    exit(1);
}

require $migrations;

function expect_migration(bool $actual, string $message): void {
    if (!$actual) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

$directory = dirname(__DIR__, 2) . '/public/api/migrations';
$paths = erp_migration_paths($directory);
$names = array_map('basename', $paths);

// Список не хардкодим: раньше он устаревал при каждой новой миграции и тест
// падал на корректном изменении. Проверяем сами инварианты выполнения.
$onDisk = array_map('basename', glob($directory . '/*.sql') ?: []);
sort($onDisk, SORT_STRING);

expect_migration($onDisk !== [], 'Migrations directory must not be empty');
expect_migration(count($names) === count(array_unique($names)), 'No migration may run twice');

$discovered = $names;
sort($discovered, SORT_STRING);
expect_migration($discovered === $onDisk, 'Every migration file on disk must be discovered by the runner');

$expectedOrder = $names;
usort($expectedOrder, static fn (string $a, string $b): int => strcmp($a, $b));
expect_migration($names === $expectedOrder, 'All ERP migrations must run once in numeric order');

// Номера идут подряд от 001: пропуск обычно значит потерянный при переносе
// файл, а дубликат — две миграции, одна из которых молча не применится.
$numbers = [];
foreach ($names as $name) {
    expect_migration((bool) preg_match('/^(\d{3})_[a-z0-9_]+\.sql$/', $name, $match), "Migration {$name} must be named NNN_lower_snake.sql");
    $numbers[] = (int) $match[1];
}
expect_migration($numbers === range(1, count($numbers)), 'Migration numbers must be contiguous starting at 001');

foreach ($paths as $path) {
    expect_migration(is_readable($path), 'Every discovered migration must be readable');
}

// Разбор на выражения: точка с запятой внутри комментария однажды разорвала
// файл посередине. Половина миграции применилась, вторая упала, миграция не
// записалась как применённая — и повторный запуск спотыкался уже об
// «Duplicate column name», из которого база сама не выбирается.
expect_migration(
    erp_migration_statements("-- список; и продолжение\nCREATE TABLE a (id INT);") === ['CREATE TABLE a (id INT)'],
    'Semicolon inside a comment must not split the file'
);
expect_migration(
    erp_migration_statements("INSERT INTO t (v) VALUES ('a;b');") === ["INSERT INTO t (v) VALUES ('a;b')"],
    'Semicolon inside a string literal must not split the file'
);
expect_migration(
    count(erp_migration_statements("CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);")) === 2,
    'Real statement separators must still split'
);
expect_migration(
    erp_migration_statements("/* блок; с точкой */ CREATE TABLE c (id INT);") === ['CREATE TABLE c (id INT)'],
    'Semicolon inside a block comment must not split the file'
);

// Каждое выражение всех реальных миграций должно быть исполняемым, а не
// обрывком комментария.
foreach ($paths as $path) {
    $sql = file_get_contents($path);
    foreach (erp_migration_statements((string) $sql) as $index => $statement) {
        expect_migration(
            (bool) preg_match('/^(CREATE|ALTER|INSERT|UPDATE|DROP|SET|PREPARE|EXECUTE|DEALLOCATE)/i', $statement),
            sprintf('%s statement #%d is not executable SQL', basename($path), $index + 1)
        );
    }
}

echo "Migration runner tests passed\n";
