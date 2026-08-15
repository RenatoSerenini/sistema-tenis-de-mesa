<?php

declare(strict_types=1);

require_once __DIR__ . '/includes/functions.php';

$today = new DateTimeImmutable('now');

$months = [
    1 => 'Janeiro',
    2 => 'Fevereiro',
    3 => 'Marco',
    4 => 'Abril',
    5 => 'Maio',
    6 => 'Junho',
    7 => 'Julho',
    8 => 'Agosto',
    9 => 'Setembro',
    10 => 'Outubro',
    11 => 'Novembro',
    12 => 'Dezembro',
];
$todayLabel = $today->format('d') . ' de ' . ($months[(int)$today->format('n')] ?? '') . ' de ' . $today->format('Y');

$championshipStats = db()->query(
    "SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status <> 'finished' THEN 1 ELSE 0 END), 0) AS active,
        COALESCE(SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed
     FROM championships"
)->fetch() ?: ['total' => 0, 'active' => 0, 'confirmed' => 0];

$playersCount = (int)db()->query('SELECT COUNT(*) FROM players')->fetchColumn();
$categoriesCount = (int)db()->query('SELECT COUNT(DISTINCT category) FROM players WHERE TRIM(category) <> ""')->fetchColumn();

$matchesStats = db()->query(
    "SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
        COALESCE(SUM(CASE WHEN status = 'pending' AND player1_id IS NOT NULL AND player2_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS pending_ready
     FROM matches"
)->fetch() ?: ['total' => 0, 'completed' => 0, 'pending_ready' => 0];

$currentRoundStmt = db()->query(
    "SELECT m.round_number
     FROM matches m
     INNER JOIN championships c ON c.id = m.championship_id
     WHERE c.status = 'confirmed'
       AND m.status = 'pending'
       AND m.group_number IS NULL
     ORDER BY m.round_number ASC
     LIMIT 1"
);
$currentRound = (int)($currentRoundStmt->fetchColumn() ?: 0);
if ($currentRound === 0) {
    $fallbackRoundStmt = db()->query(
        "SELECT COALESCE(MAX(m.round_number), 0)
         FROM matches m
         INNER JOIN championships c ON c.id = m.championship_id
         WHERE c.status IN ('confirmed', 'finished')
           AND m.group_number IS NULL"
    );
    $currentRound = (int)$fallbackRoundStmt->fetchColumn();
}

$upcomingMatchesStmt = db()->query(
    "SELECT
        m.id,
        m.championship_id,
        m.round_number,
        m.match_number,
        m.group_number,
        c.name AS championship_name,
        c.championship_date,
        p1.name AS player1_name,
        p2.name AS player2_name,
        p1.category AS player1_category,
        p2.category AS player2_category,
        rounds.total_rounds
     FROM matches m
     INNER JOIN championships c ON c.id = m.championship_id
     LEFT JOIN players p1 ON p1.id = m.player1_id
     LEFT JOIN players p2 ON p2.id = m.player2_id
     LEFT JOIN (
         SELECT championship_id, MAX(round_number) AS total_rounds
         FROM matches
         WHERE group_number IS NULL
         GROUP BY championship_id
     ) rounds ON rounds.championship_id = m.championship_id
     WHERE m.status = 'pending'
       AND m.player1_id IS NOT NULL
       AND m.player2_id IS NOT NULL
     ORDER BY c.championship_date ASC, m.round_number ASC, m.match_number ASC, m.id ASC
     LIMIT 4"
);
$upcomingMatches = $upcomingMatchesStmt->fetchAll();

$recentResultsStmt = db()->query(
    "SELECT
        m.id,
        m.championship_id,
        m.sets_p1,
        m.sets_p2,
        m.updated_at,
        c.championship_date,
        p1.name AS player1_name,
        p2.name AS player2_name,
        p1.category AS player1_category,
        p2.category AS player2_category,
        w.name AS winner_name
     FROM matches m
     INNER JOIN championships c ON c.id = m.championship_id
     LEFT JOIN players p1 ON p1.id = m.player1_id
     LEFT JOIN players p2 ON p2.id = m.player2_id
     LEFT JOIN players w ON w.id = m.winner_id
     WHERE m.status = 'completed'
     ORDER BY m.updated_at DESC, m.id DESC
     LIMIT 4"
);
$recentResults = $recentResultsStmt->fetchAll();

$rankingMatchesStmt = db()->query(
    "SELECT
        m.player1_id,
        m.player2_id,
        m.winner_id,
        m.sets_p1,
        m.sets_p2,
        m.total_points_p1,
        m.total_points_p2,
        p1.name AS player1_name,
        p2.name AS player2_name,
        p1.category AS player1_category,
        p2.category AS player2_category
     FROM matches m
     LEFT JOIN players p1 ON p1.id = m.player1_id
     LEFT JOIN players p2 ON p2.id = m.player2_id
     WHERE m.status = 'completed'
       AND m.player1_id IS NOT NULL
       AND m.player2_id IS NOT NULL"
);

$rankingMap = [];
foreach ($rankingMatchesStmt->fetchAll() as $match) {
    $p1Id = (int)$match['player1_id'];
    $p2Id = (int)$match['player2_id'];
    $winnerId = (int)($match['winner_id'] ?? 0);

    if (!isset($rankingMap[$p1Id])) {
        $rankingMap[$p1Id] = [
            'id' => $p1Id,
            'name' => (string)($match['player1_name'] ?? 'Jogador #' . $p1Id),
            'category' => (string)($match['player1_category'] ?? '-'),
            'wins' => 0,
            'losses' => 0,
            'sets_for' => 0,
            'sets_against' => 0,
            'points_for' => 0,
            'points_against' => 0,
        ];
    }

    if (!isset($rankingMap[$p2Id])) {
        $rankingMap[$p2Id] = [
            'id' => $p2Id,
            'name' => (string)($match['player2_name'] ?? 'Jogador #' . $p2Id),
            'category' => (string)($match['player2_category'] ?? '-'),
            'wins' => 0,
            'losses' => 0,
            'sets_for' => 0,
            'sets_against' => 0,
            'points_for' => 0,
            'points_against' => 0,
        ];
    }

    $setsP1 = (int)($match['sets_p1'] ?? 0);
    $setsP2 = (int)($match['sets_p2'] ?? 0);
    $pointsP1 = (int)($match['total_points_p1'] ?? 0);
    $pointsP2 = (int)($match['total_points_p2'] ?? 0);

    $rankingMap[$p1Id]['sets_for'] += $setsP1;
    $rankingMap[$p1Id]['sets_against'] += $setsP2;
    $rankingMap[$p1Id]['points_for'] += $pointsP1;
    $rankingMap[$p1Id]['points_against'] += $pointsP2;

    $rankingMap[$p2Id]['sets_for'] += $setsP2;
    $rankingMap[$p2Id]['sets_against'] += $setsP1;
    $rankingMap[$p2Id]['points_for'] += $pointsP2;
    $rankingMap[$p2Id]['points_against'] += $pointsP1;

    if ($winnerId === $p1Id) {
        $rankingMap[$p1Id]['wins']++;
        $rankingMap[$p2Id]['losses']++;
    } elseif ($winnerId === $p2Id) {
        $rankingMap[$p2Id]['wins']++;
        $rankingMap[$p1Id]['losses']++;
    }
}

$rankingRows = array_values($rankingMap);
usort($rankingRows, static function (array $a, array $b): int {
    $aSetDiff = $a['sets_for'] - $a['sets_against'];
    $bSetDiff = $b['sets_for'] - $b['sets_against'];
    $aPointDiff = $a['points_for'] - $a['points_against'];
    $bPointDiff = $b['points_for'] - $b['points_against'];

    if ($a['wins'] !== $b['wins']) {
        return $b['wins'] <=> $a['wins'];
    }
    if ($aSetDiff !== $bSetDiff) {
        return $bSetDiff <=> $aSetDiff;
    }
    if ($aPointDiff !== $bPointDiff) {
        return $bPointDiff <=> $aPointDiff;
    }

    return strcmp((string)$a['name'], (string)$b['name']);
});
$rankingRows = array_slice($rankingRows, 0, 5);

$imgBase = 'Páginas/1 - Dashboard/Imagens de Referência - Sem Fundo';
$medalImages = [
    1 => $imgBase . '/10 - Medalhas/10_-_1º-removebg-preview.png',
    2 => $imgBase . '/10 - Medalhas/10_-_2º-removebg-preview.png',
    3 => $imgBase . '/10 - Medalhas/10_-_3º-removebg-preview.png',
    4 => $imgBase . '/10 - Medalhas/10_-_4º-removebg-preview.png',
    5 => $imgBase . '/10 - Medalhas/10_-_5º-removebg-preview.png',
];

$statsConfrontosHoje = (int)$matchesStats['pending_ready'];
$statsRodadaAtual = $currentRound > 0 ? $currentRound : 1;

?><!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel Inicial</title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="layout">
    <aside class="sidebar">
        <div class="logo">
            <img src="<?= h($imgBase . '/1_-_Logo_da_Associação-removebg-preview.png') ?>" alt="Logo da associação">
        </div>

        <nav class="menu">
            <a class="active" href="index.php"><img class="menu-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.1_-_Casa-removebg-preview.png') ?>" alt="">Dashboard</a>
            <a href="campeonatos.php"><img class="menu-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.2_-_Troféu-removebg-preview.png') ?>" alt="">Campeonatos</a>
            <a href="jogadores.php"><img class="menu-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.3_-_Duas_Pessoas-removebg-preview.png') ?>" alt="">Jogadores</a>
            <a href="campeonatos.php"><img class="menu-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.4_-_Raquetes-removebg-preview.png') ?>" alt="">Confrontos</a>
            <a href="campeonatos.php"><img class="menu-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.5_-_Barras-removebg-preview.png') ?>" alt="">Classificação</a>
            <a href="campeonatos.php"><img class="menu-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.6_-_Calendário-removebg-preview.png') ?>" alt="">Rodadas</a>
            <a href="campeonatos.php"><img class="menu-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.7_-_Pizza-removebg-preview.png') ?>" alt="">Estatísticas</a>
            <a href="campeonatos.php"><img class="menu-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.8_-_Engrenagem-removebg-preview.png') ?>" alt="">Configurações</a>
        </nav>

        <div class="user-card">
            <div class="avatar">
                <img src="<?= h($imgBase . '/12_-_Avatar-removebg-preview.png') ?>" alt="">
            </div>
            <div class="user-info">
                <strong>Administrador</strong>
                <span>● Online</span>
            </div>
        </div>
    </aside>

    <section class="main">
        <header class="topbar">
            <div class="left">
                <h2>Bem-vindo!</h2>
                <div class="underline"></div>
                <p>Gerencie campeonatos, jogadores, confrontos e resultados<br>de forma simples e organizada.</p>
            </div>
            <div class="right">
                <span class="top-date"><img src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.6_-_Calendário-removebg-preview.png') ?>" alt=""><?= h($todayLabel) ?></span>
            </div>
        </header>

        <main class="content">
            <section class="hero">
                <div class="hero-art">
                    <img src="<?= h($imgBase . '/2_-_Ilustração_de_Fundo-removebg-preview.png') ?>" alt="Ilustração de fundo">
                </div>
                <div class="hero-racket">
                    <img src="<?= h($imgBase . '/3_-_Raquete__fundo_-removebg-preview.png') ?>" alt="Raquete decorativa">
                </div>

                <div class="stats">
                    <article class="stat">
                        <div class="icon green"><img src="<?= h($imgBase . '/7 - Icones de Card/7.1_-_Troféu-removebg-preview.png') ?>" alt=""></div>
                        <div>
                            <div class="kicker">Campeonatos</div>
                            <div class="value"><?= (int)$championshipStats['total'] ?></div>
                            <div class="sub">Ativos: <?= (int)$championshipStats['active'] ?></div>
                        </div>
                    </article>

                    <article class="stat">
                        <div class="icon red"><img src="<?= h($imgBase . '/7 - Icones de Card/7.2_-_Duas_Pessoas-removebg-preview.png') ?>" alt=""></div>
                        <div>
                            <div class="kicker">Jogadores</div>
                            <div class="value"><?= $playersCount ?></div>
                            <div class="sub">Cadastrados</div>
                        </div>
                    </article>

                    <article class="stat">
                        <div class="icon green"><img src="<?= h($imgBase . '/7 - Icones de Card/7.3_-_Raquetes-removebg-preview.png') ?>" alt=""></div>
                        <div>
                            <div class="kicker">Confrontos</div>
                            <div class="value"><?= $statsConfrontosHoje ?></div>
                            <div class="sub">Pendentes</div>
                        </div>
                    </article>

                    <article class="stat">
                        <div class="icon red"><img src="<?= h($imgBase . '/7 - Icones de Card/7.4_-_Calendário-removebg-preview.png') ?>" alt=""></div>
                        <div>
                            <div class="kicker">Rodada Atual</div>
                            <div class="value"><?= $statsRodadaAtual ?></div>
                            <div class="sub">Em andamento</div>
                        </div>
                    </article>

                    <article class="stat">
                        <div class="icon green"><img src="<?= h($imgBase . '/7 - Icones de Card/7.5_-_Barras-removebg-preview.png') ?>" alt=""></div>
                        <div>
                            <div class="kicker">Categorias</div>
                            <div class="value"><?= $categoriesCount ?></div>
                            <div class="sub">Ativas</div>
                        </div>
                    </article>
                </div>
            </section>

            <section class="cols">
                <article class="panel">
                    <header class="panel-head">
                        <div class="title"><img class="title-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.4_-_Raquetes-removebg-preview.png') ?>" alt="">Próximos Confrontos</div>
                    </header>
                    <div class="list">
                        <?php if (!$upcomingMatches): ?>
                            <div class="fight">
                                <div class="time"><b>--:--</b><br><b>--/--</b></div>
                                <div class="players"><b>Sem confrontos</b><br><span class="p2">pendentes</span></div>
                                <div class="vs">VS</div>
                                <div class="meta"><span class="cat"><b>-</b></span><br>Aguardando</div>
                            </div>
                        <?php else: ?>
                            <?php foreach ($upcomingMatches as $match): ?>
                                <?php
                                $categoryP1 = trim((string)($match['player1_category'] ?? ''));
                                $categoryP2 = trim((string)($match['player2_category'] ?? ''));
                                $categoryLabel = $categoryP1 !== ''
                                    ? ($categoryP1 === $categoryP2 || $categoryP2 === '' ? $categoryP1 : $categoryP1 . ' / ' . $categoryP2)
                                    : ($categoryP2 !== '' ? $categoryP2 : '-');

                                $champDate = new DateTimeImmutable((string)$match['championship_date']);
                                $roundText = $match['group_number'] !== null
                                    ? ('Grupo ' . (int)$match['group_number'])
                                    : roundLabel((int)$match['round_number'], (int)($match['total_rounds'] ?: $match['round_number']));
                                ?>
                                <div class="fight">
                                    <div class="time"><b>--:--</b><br><b><?= h($champDate->format('d/m')) ?></b></div>
                                    <div class="players"><b><?= h((string)$match['player1_name']) ?></b><br><span class="p2"><?= h((string)$match['player2_name']) ?></span></div>
                                    <div class="vs">VS</div>
                                    <div class="meta"><span class="cat"><b><?= h($categoryLabel) ?></b></span><br><?= h($roundText) ?></div>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                    <footer class="panel-foot">
                        <button class="btn primary" type="button" onclick="window.location.href='campeonatos.php'">Ver chave completa</button>
                    </footer>
                </article>

                <article class="panel">
                    <header class="panel-head">
                        <div class="title"><img class="title-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.2_-_Troféu-removebg-preview.png') ?>" alt="">Resultados Recentes</div>
                    </header>
                    <div class="list">
                        <?php if (!$recentResults): ?>
                            <div class="result-row">
                                <div class="center-col"><img src="<?= h($imgBase . '/8_-_Check_Circle-removebg-preview.png') ?>" alt="Finalizado"></div>
                                <div class="team-col">
                                    <div class="line"><span><b>Sem resultados</b></span><strong><b>-</b></strong></div>
                                    <div class="line"><span>Ainda não há partidas concluídas</span><strong>-</strong></div>
                                </div>
                                <div class="result-meta">--/--<br><b>-</b></div>
                            </div>
                        <?php else: ?>
                            <?php foreach ($recentResults as $result): ?>
                                <?php
                                $categoryP1 = trim((string)($result['player1_category'] ?? ''));
                                $categoryP2 = trim((string)($result['player2_category'] ?? ''));
                                $categoryLabel = $categoryP1 !== ''
                                    ? ($categoryP1 === $categoryP2 || $categoryP2 === '' ? $categoryP1 : $categoryP1 . ' / ' . $categoryP2)
                                    : ($categoryP2 !== '' ? $categoryP2 : '-');

                                $winner = (string)($result['winner_name'] ?? '');
                                $p1Name = (string)($result['player1_name'] ?? '-');
                                $p2Name = (string)($result['player2_name'] ?? '-');
                                $p1Highlight = $winner !== '' && $winner === $p1Name;
                                $p2Highlight = $winner !== '' && $winner === $p2Name;

                                $resultDate = new DateTimeImmutable((string)($result['updated_at'] ?? $result['championship_date']));
                                ?>
                                <div class="result-row">
                                    <div class="center-col"><img src="<?= h($imgBase . '/8_-_Check_Circle-removebg-preview.png') ?>" alt="Finalizado"></div>
                                    <div class="team-col">
                                        <div class="line"><span><?= $p1Highlight ? '<b>' . h($p1Name) . '</b>' : h($p1Name) ?></span><strong><?= $p1Highlight ? '<b>' . (int)$result['sets_p1'] . '</b>' : (int)$result['sets_p1'] ?></strong></div>
                                        <div class="line"><span><?= $p2Highlight ? '<b>' . h($p2Name) . '</b>' : h($p2Name) ?></span><strong><?= $p2Highlight ? '<b>' . (int)$result['sets_p2'] . '</b>' : (int)$result['sets_p2'] ?></strong></div>
                                    </div>
                                    <div class="result-meta"><?= h($resultDate->format('d/m')) ?><br><b><?= h($categoryLabel) ?></b></div>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                    <footer class="panel-foot">
                        <button class="btn secondary" type="button" onclick="window.location.href='campeonatos.php'">Ver todos os resultados</button>
                    </footer>
                </article>

                <article class="panel">
                    <header class="panel-head">
                        <div class="title"><img class="title-ico" src="<?= h($imgBase . '/5 - Icones do Menu Lateral/5.5_-_Barras-removebg-preview.png') ?>" alt="">Classificação Geral</div>
                    </header>
                    <div class="rank-list">
                        <?php if (!$rankingRows): ?>
                            <div class="rank-row">
                                <img class="medal-img" src="<?= h($medalImages[1]) ?>" alt="1º lugar">
                                <div class="rank-name"><b>Sem classificação</b><small>Aguardando resultados</small></div>
                                <div class="rank-points"><b>0 pts</b><span>0</span></div>
                            </div>
                        <?php else: ?>
                            <?php foreach ($rankingRows as $index => $row): ?>
                                <?php
                                $position = $index + 1;
                                $medal = $medalImages[$position] ?? $medalImages[5];
                                $setDiff = (int)$row['sets_for'] - (int)$row['sets_against'];
                                $setDiffLabel = $setDiff > 0 ? '+' . $setDiff : (string)$setDiff;
                                ?>
                                <div class="rank-row">
                                    <img class="medal-img" src="<?= h($medal) ?>" alt="<?= h((string)$position) ?>º lugar">
                                    <div class="rank-name"><b><?= h((string)$row['name']) ?></b><small><?= h((string)$row['category']) ?></small></div>
                                    <div class="rank-points"><b><?= (int)$row['points_for'] ?> pts</b><span><?= h($setDiffLabel) ?></span></div>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                    <footer class="panel-foot">
                        <button class="btn primary" type="button" onclick="window.location.href='campeonatos.php'">Ver classificação completa</button>
                    </footer>
                </article>
            </section>

            <section class="quick">
                <h3><span class="quick-dot"></span>Ações Rápidas</h3>
                <div class="quick-grid">
                    <button class="quick-btn green" type="button" onclick="window.location.href='jogadores.php'"><img class="quick-ico" src="<?= h($imgBase . '/9 - Icones de Ação Rápida/9.1_-_Pessoa_Mais-removebg-preview.png') ?>" alt=""><span>Novo Jogador<small>Cadastrar jogador</small></span></button>
                    <button class="quick-btn" type="button" onclick="window.location.href='campeonatos.php'"><img class="quick-ico" src="<?= h($imgBase . '/9 - Icones de Ação Rápida/9.2_-_Troféu-removebg-preview.png') ?>" alt=""><span>Novo Campeonato<small>Criar campeonato</small></span></button>
                    <button class="quick-btn green" type="button" onclick="window.location.href='campeonatos.php'"><img class="quick-ico" src="<?= h($imgBase . '/9 - Icones de Ação Rápida/9.3_-_Calendário-removebg-preview.png') ?>" alt=""><span>Iniciar Rodada<small>Avançar rodada</small></span></button>
                    <button class="quick-btn" type="button" onclick="window.location.href='campeonatos.php'"><img class="quick-ico" src="<?= h($imgBase . '/9 - Icones de Ação Rápida/9.4_-_Raquetes-removebg-preview.png') ?>" alt=""><span>Registrar Resultado<small>Lançar resultado</small></span></button>
                    <button class="quick-btn green" type="button" onclick="window.location.href='campeonatos.php'"><img class="quick-ico" src="<?= h($imgBase . '/9 - Icones de Ação Rápida/9.5_-_Barras-removebg-preview.png') ?>" alt=""><span>Ver Estatísticas<small>Relatórios e gráficos</small></span></button>
                </div>
            </section>
        </main>
    </section>
</div>
</body>
</html>
