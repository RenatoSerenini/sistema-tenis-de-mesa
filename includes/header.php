<?php
if (!isset($pageTitle)) {
    $pageTitle = 'Sistema de Campeonatos - Tênis de Mesa';
}

$currentPage = basename($_SERVER['PHP_SELF'] ?? 'index.php');
$today = new DateTimeImmutable('now');

$mainNavigation = [
    ['href' => 'index.php', 'label' => 'Dashboard', 'pages' => ['index.php']],
    ['href' => 'campeonatos.php', 'label' => 'Campeonatos', 'pages' => ['campeonatos.php', 'campeonato.php']],
    ['href' => 'jogadores.php', 'label' => 'Jogadores', 'pages' => ['jogadores.php']],
];

$extraModules = [
    'Categorias',
    'Confrontos',
    'Rodadas',
    'Classificacao',
    'Estatisticas',
    'Configuracoes',
];

$pageDescriptions = [
    'index.php' => 'Visao geral do sistema com acesso rapido aos principais modulos.',
    'jogadores.php' => 'Cadastro e manutencao de jogadores e categorias competitivas.',
    'campeonatos.php' => 'Crie e administre campeonatos preservando as regras oficiais.',
    'campeonato.php' => 'Gerencie participantes, chaveamentos, confrontos e resultados do campeonato.',
];

$pageDescription = $pageDescriptions[$currentPage] ?? 'Gerencie campeonatos, jogadores e resultados com uma interface unificada.';
?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= h($pageTitle) ?></title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="layout">
    <aside class="sidebar">
        <div class="logo">
            <span class="logo-mark">STM</span>
            <div class="logo-text">
                <strong>Sistema de Campeonatos</strong>
                <small>Tenis de Mesa</small>
            </div>
        </div>

        <nav class="menu" aria-label="Menu principal">
            <?php foreach ($mainNavigation as $item): ?>
                <?php $active = in_array($currentPage, $item['pages'], true); ?>
                <a class="<?= $active ? 'active' : '' ?>" href="<?= h($item['href']) ?>">
                    <span class="menu-dot" aria-hidden="true"></span>
                    <span><?= h($item['label']) ?></span>
                </a>
            <?php endforeach; ?>

            <div class="menu-group-title">Outros modulos</div>
            <?php foreach ($extraModules as $module): ?>
                <span class="menu-disabled">
                    <span class="menu-dot" aria-hidden="true"></span>
                    <span><?= h($module) ?></span>
                    <small>em breve</small>
                </span>
            <?php endforeach; ?>
        </nav>

        <div class="user-card">
            <div class="avatar" aria-hidden="true">A</div>
            <div class="user-info">
                <strong>Administrador</strong>
                <span>Painel ativo</span>
            </div>
        </div>
    </aside>

    <section class="main">
        <header class="topbar">
            <div class="left">
                <h2><?= h($pageTitle) ?></h2>
                <div class="underline"></div>
                <p><?= h($pageDescription) ?></p>
            </div>
            <div class="right">
                <span class="top-date"><?= h($today->format('d/m/Y')) ?></span>
            </div>
        </header>

        <main class="content container">
