<?php

declare(strict_types=1);

$DB_HOST = 'localhost';
$DB_NAME = 'tenis_mesa';
$DB_USER = 'root';
$DB_PASS = 'root';

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    global $DB_HOST, $DB_NAME, $DB_USER, $DB_PASS;

    $dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    $pdo = new PDO($dsn, $DB_USER, $DB_PASS, $options);
    return $pdo;
}
