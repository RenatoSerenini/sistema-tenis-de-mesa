<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';

function redirect(string $url): void
{
    header('Location: ' . $url);
    exit;
}

function h(?string $value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function statusLabel(string $status): string
{
    return match ($status) {
        'setup' => 'Em configuração',
        'confirmed' => 'Confirmado',
        'finished' => 'Finalizado',
        default => 'Desconhecido',
    };
}

function championshipFormatLabel(string $format): string
{
    return match ($format) {
        'groups' => 'Fase de grupos',
        default => 'Eliminatório',
    };
}

function normalizeChampionshipFormat(?string $format): string
{
    return $format === 'groups' ? 'groups' : 'knockout';
}

function normalizeGroupSize(int $size): int
{
    if ($size < 3) {
        return 3;
    }
    if ($size > 8) {
        return 8;
    }
    return $size;
}

function normalizeGroupQualifiers(int $count): int
{
    if ($count < 1) {
        return 1;
    }
    if ($count > 8) {
        return 8;
    }
    return $count;
}

function ensureSchemaEvolution(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    $checked = true;

    $colStmt = db()->prepare(
        'SELECT COUNT(*)
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = :table_name
           AND column_name = :column_name'
    );

    $hasColumn = static function (string $table, string $column) use ($colStmt): bool {
        $colStmt->execute([
            'table_name' => $table,
            'column_name' => $column,
        ]);
        return (int)$colStmt->fetchColumn() > 0;
    };

    if (!$hasColumn('championships', 'organization_type')) {
        db()->exec(
            "ALTER TABLE championships
             ADD COLUMN organization_type ENUM('knockout', 'groups') NOT NULL DEFAULT 'knockout' AFTER championship_date"
        );
    }

    if (!$hasColumn('championships', 'preferred_group_size')) {
        db()->exec(
            "ALTER TABLE championships
             ADD COLUMN preferred_group_size TINYINT UNSIGNED NULL AFTER organization_type"
        );
    }

    if (!$hasColumn('championships', 'group_qualifiers_count')) {
        db()->exec(
            "ALTER TABLE championships
             ADD COLUMN group_qualifiers_count TINYINT UNSIGNED NULL AFTER preferred_group_size"
        );
    }

    if (!$hasColumn('matches', 'group_number')) {
        db()->exec(
            "ALTER TABLE matches
             ADD COLUMN group_number INT NULL AFTER match_number"
        );
    }
}

ensureSchemaEvolution();

function nextPowerOfTwo(int $value): int
{
    $power = 1;
    while ($power < $value) {
        $power *= 2;
    }
    return $power;
}

function roundLabel(int $roundNumber, int $totalRounds): string
{
    $matchesInRound = (int)(2 ** ($totalRounds - $roundNumber));

    if ($matchesInRound === 1) {
        return 'Final';
    }
    if ($matchesInRound === 2) {
        return 'Semifinal';
    }
    if ($matchesInRound === 4) {
        return 'Quartas de final';
    }
    if ($matchesInRound === 8) {
        return 'Oitavas de final';
    }

    return 'Fase ' . $roundNumber;
}

function getChampionship(int $championshipId): ?array
{
    $stmt = db()->prepare('SELECT * FROM championships WHERE id = :id');
    $stmt->execute(['id' => $championshipId]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function getChampionshipParticipants(int $championshipId): array
{
    $stmt = db()->prepare(
        'SELECT p.*
         FROM championship_players cp
         INNER JOIN players p ON p.id = cp.player_id
         WHERE cp.championship_id = :championship_id
         ORDER BY p.name'
    );
    $stmt->execute(['championship_id' => $championshipId]);
    return $stmt->fetchAll();
}

function getMatchesByChampionship(int $championshipId): array
{
    $stmt = db()->prepare(
        'SELECT m.*,
                p1.name AS player1_name,
                p2.name AS player2_name,
                w.name AS winner_name
         FROM matches m
         LEFT JOIN players p1 ON p1.id = m.player1_id
         LEFT JOIN players p2 ON p2.id = m.player2_id
         LEFT JOIN players w ON w.id = m.winner_id
         WHERE m.championship_id = :championship_id
            ORDER BY CASE WHEN m.group_number IS NULL THEN 1 ELSE 0 END,
                   m.group_number,
                   m.round_number,
                   m.match_number'
    );
    $stmt->execute(['championship_id' => $championshipId]);
    return $stmt->fetchAll();
}

function groupMatchesByGroup(array $matches): array
{
    $grouped = [];

    foreach ($matches as $match) {
        if (!isset($match['group_number']) || $match['group_number'] === null) {
            continue;
        }

        $groupNumber = (int)$match['group_number'];
        if (!isset($grouped[$groupNumber])) {
            $grouped[$groupNumber] = [];
        }
        $grouped[$groupNumber][] = $match;
    }

    ksort($grouped);
    return $grouped;
}

function groupMatchesByRound(array $matches): array
{
    $grouped = [];

    foreach ($matches as $match) {
        $round = (int)$match['round_number'];
        if (!isset($grouped[$round])) {
            $grouped[$round] = [];
        }
        $grouped[$round][] = $match;
    }

    ksort($grouped);
    return $grouped;
}

function generateBracketSuggestion(int $championshipId): array
{
    $championship = getChampionship($championshipId);
    if (!$championship) {
        return [false, 'Campeonato não encontrado.'];
    }

    if ($championship['status'] !== 'setup') {
        return [false, 'A chave só pode ser gerada enquanto o campeonato estiver em configuração.'];
    }

    $format = normalizeChampionshipFormat($championship['organization_type'] ?? 'knockout');
    if ($format === 'groups') {
        return generateGroupStageSuggestion($championshipId);
    }

    $participants = getChampionshipParticipants($championshipId);
    if (count($participants) < 2) {
        return [false, 'É necessário pelo menos 2 participantes para gerar a chave.'];
    }

    $playerIds = array_map(static fn(array $p): int => (int)$p['id'], $participants);
    shuffle($playerIds);

    $bracketSize = nextPowerOfTwo(count($playerIds));
    $byeCount = $bracketSize - count($playerIds);

    $slots = $playerIds;
    for ($i = 0; $i < $byeCount; $i++) {
        $slots[] = null;
    }
    shuffle($slots);

    $totalRounds = (int)log($bracketSize, 2);
    $pdo = db();

    try {
        $pdo->beginTransaction();

        $pdo->prepare('DELETE FROM matches WHERE championship_id = :championship_id')
            ->execute(['championship_id' => $championshipId]);

        $roundMatchIds = [];

        for ($round = 1; $round <= $totalRounds; $round++) {
            $roundMatchIds[$round] = [];
            $matchesInRound = (int)($bracketSize / (2 ** $round));

            for ($matchNumber = 1; $matchNumber <= $matchesInRound; $matchNumber++) {
                $player1Id = null;
                $player2Id = null;

                if ($round === 1) {
                    $slotIndex = ($matchNumber - 1) * 2;
                    $player1Id = $slots[$slotIndex] ?? null;
                    $player2Id = $slots[$slotIndex + 1] ?? null;
                }

                $insert = $pdo->prepare(
                    'INSERT INTO matches (
                        championship_id, round_number, match_number,
                        player1_id, player2_id, status
                     ) VALUES (
                        :championship_id, :round_number, :match_number,
                        :player1_id, :player2_id, :status
                     )'
                );
                $insert->execute([
                    'championship_id' => $championshipId,
                    'round_number' => $round,
                    'match_number' => $matchNumber,
                    'player1_id' => $player1Id,
                    'player2_id' => $player2Id,
                    'status' => 'pending',
                ]);

                $roundMatchIds[$round][$matchNumber] = (int)$pdo->lastInsertId();
            }
        }

        for ($round = 1; $round < $totalRounds; $round++) {
            foreach ($roundMatchIds[$round] as $matchNumber => $matchId) {
                $nextRoundMatchNumber = (int)ceil($matchNumber / 2);
                $nextMatchId = $roundMatchIds[$round + 1][$nextRoundMatchNumber];
                $nextSlot = ($matchNumber % 2 === 1) ? 'player1' : 'player2';

                $pdo->prepare(
                    'UPDATE matches
                     SET next_match_id = :next_match_id, next_slot = :next_slot
                     WHERE id = :id'
                )->execute([
                    'next_match_id' => $nextMatchId,
                    'next_slot' => $nextSlot,
                    'id' => $matchId,
                ]);
            }
        }

        $pdo->commit();
        return [true, 'Chave sugerida gerada com sucesso.'];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return [false, 'Erro ao gerar chave: ' . $e->getMessage()];
    }
}

function generateGroupStageSuggestion(int $championshipId): array
{
    $championship = getChampionship($championshipId);
    if (!$championship) {
        return [false, 'Campeonato não encontrado.'];
    }

    if ($championship['status'] !== 'setup') {
        return [false, 'Os confrontos só podem ser gerados enquanto o campeonato estiver em configuração.'];
    }

    $participants = getChampionshipParticipants($championshipId);
    if (count($participants) < 3) {
        return [false, 'Para fase de grupos, é necessário pelo menos 3 participantes.'];
    }

    $preferredSize = normalizeGroupSize((int)($championship['preferred_group_size'] ?? 4));
    $playerIds = array_map(static fn(array $p): int => (int)$p['id'], $participants);
    shuffle($playerIds);

    $totalPlayers = count($playerIds);
    $groupCount = (int)ceil($totalPlayers / $preferredSize);
    $groupCount = max(1, $groupCount);

    $groups = [];
    for ($i = 1; $i <= $groupCount; $i++) {
        $groups[$i] = [];
    }

    foreach ($playerIds as $index => $playerId) {
        $groupNumber = ($index % $groupCount) + 1;
        $groups[$groupNumber][] = $playerId;
    }

    $pdo = db();

    try {
        $pdo->beginTransaction();

        $pdo->prepare('DELETE FROM matches WHERE championship_id = :championship_id')
            ->execute(['championship_id' => $championshipId]);

        foreach ($groups as $groupNumber => $groupPlayers) {
            $matchNumber = 1;
            $count = count($groupPlayers);

            for ($i = 0; $i < $count; $i++) {
                for ($j = $i + 1; $j < $count; $j++) {
                    $pdo->prepare(
                        'INSERT INTO matches (
                            championship_id,
                            round_number,
                            match_number,
                            group_number,
                            player1_id,
                            player2_id,
                            status
                        ) VALUES (
                            :championship_id,
                            :round_number,
                            :match_number,
                            :group_number,
                            :player1_id,
                            :player2_id,
                            :status
                        )'
                    )->execute([
                        'championship_id' => $championshipId,
                        'round_number' => 1,
                        'match_number' => $matchNumber,
                        'group_number' => $groupNumber,
                        'player1_id' => $groupPlayers[$i],
                        'player2_id' => $groupPlayers[$j],
                        'status' => 'pending',
                    ]);

                    $matchNumber++;
                }
            }
        }

        $pdo->commit();
        return [true, 'Confrontos sugeridos para fase de grupos gerados com sucesso.'];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return [false, 'Erro ao gerar fase de grupos: ' . $e->getMessage()];
    }
}

function resetRoundsAfterFirstRound(int $championshipId): void
{
    db()->prepare(
        "UPDATE matches
         SET player1_id = NULL,
             player2_id = NULL,
             winner_id = NULL,
             is_bye = 0,
             status = 'pending',
             sets_p1 = NULL,
             sets_p2 = NULL,
             total_points_p1 = NULL,
             total_points_p2 = NULL,
             set_details = NULL
         WHERE championship_id = :championship_id AND round_number > 1"
    )->execute(['championship_id' => $championshipId]);

    db()->prepare(
        "UPDATE matches
         SET winner_id = NULL,
             is_bye = 0,
             status = 'pending',
             sets_p1 = NULL,
             sets_p2 = NULL,
             total_points_p1 = NULL,
             total_points_p2 = NULL,
             set_details = NULL
         WHERE championship_id = :championship_id AND round_number = 1"
    )->execute(['championship_id' => $championshipId]);
}

function getGroupQualifiersCount(array $championship): int
{
    return normalizeGroupQualifiers((int)($championship['group_qualifiers_count'] ?? 2));
}

function getGroupQualifiedRowsForKnockout(int $championshipId, int $qualifiersPerGroup): array
{
    $standings = getGroupStandings($championshipId);
    $groups = $standings['groups'];
    if (!$groups) {
        return [];
    }

    ksort($groups);
    $orderedGroups = array_keys($groups);
    $qualifiedRows = [];

    if (count($orderedGroups) === 2 && $qualifiersPerGroup === 2) {
        $groupA = $groups[$orderedGroups[0]];
        $groupB = $groups[$orderedGroups[1]];

        if (isset($groupA[0], $groupA[1], $groupB[0], $groupB[1])) {
            $qualifiedRows[] = $groupA[0];
            $qualifiedRows[] = $groupB[1];
            $qualifiedRows[] = $groupB[0];
            $qualifiedRows[] = $groupA[1];
            return $qualifiedRows;
        }
    }

    for ($position = 1; $position <= $qualifiersPerGroup; $position++) {
        foreach ($orderedGroups as $groupNumber) {
            $idx = $position - 1;
            if (isset($groups[$groupNumber][$idx])) {
                $qualifiedRows[] = $groups[$groupNumber][$idx];
            }
        }
    }

    return $qualifiedRows;
}

function generateKnockoutFromGroupStage(int $championshipId): array
{
    $championship = getChampionship($championshipId);
    if (!$championship) {
        return [false, 'Campeonato não encontrado.'];
    }

    $format = normalizeChampionshipFormat($championship['organization_type'] ?? 'knockout');
    if ($format !== 'groups') {
        return [false, 'Esta ação é válida apenas para campeonatos em fase de grupos.'];
    }

    $groupPendingStmt = db()->prepare(
        "SELECT COUNT(*)
         FROM matches
         WHERE championship_id = :championship_id
           AND group_number IS NOT NULL
           AND status <> 'completed'"
    );
    $groupPendingStmt->execute(['championship_id' => $championshipId]);
    if ((int)$groupPendingStmt->fetchColumn() > 0) {
        return [false, 'Ainda existem partidas pendentes na fase de grupos.'];
    }

    $qualifiersPerGroup = getGroupQualifiersCount($championship);
    $qualifiedRows = getGroupQualifiedRowsForKnockout($championshipId, $qualifiersPerGroup);
    $qualifiedPlayerIds = [];

    foreach ($qualifiedRows as $row) {
        $playerId = (int)($row['player_id'] ?? 0);
        if ($playerId > 0) {
            $qualifiedPlayerIds[] = $playerId;
        }
    }

    $qualifiedPlayerIds = array_values(array_unique($qualifiedPlayerIds));
    if (count($qualifiedPlayerIds) < 2) {
        return [false, 'Não há jogadores suficientes classificados para montar o mata-mata.'];
    }

    $bracketSize = nextPowerOfTwo(count($qualifiedPlayerIds));
    $byeCount = $bracketSize - count($qualifiedPlayerIds);

    $slots = $qualifiedPlayerIds;
    for ($i = 0; $i < $byeCount; $i++) {
        $slots[] = null;
    }

    $totalRounds = (int)log($bracketSize, 2);
    $pdo = db();
    $startedTransaction = !$pdo->inTransaction();

    try {
        if ($startedTransaction) {
            $pdo->beginTransaction();
        }

        $pdo->prepare(
            'DELETE FROM matches WHERE championship_id = :championship_id AND group_number IS NULL'
        )->execute(['championship_id' => $championshipId]);

        $roundMatchIds = [];

        for ($round = 1; $round <= $totalRounds; $round++) {
            $roundMatchIds[$round] = [];
            $matchesInRound = (int)($bracketSize / (2 ** $round));

            for ($matchNumber = 1; $matchNumber <= $matchesInRound; $matchNumber++) {
                $player1Id = null;
                $player2Id = null;

                if ($round === 1) {
                    $slotIndex = ($matchNumber - 1) * 2;
                    $player1Id = $slots[$slotIndex] ?? null;
                    $player2Id = $slots[$slotIndex + 1] ?? null;
                }

                $insert = $pdo->prepare(
                    'INSERT INTO matches (
                        championship_id, round_number, match_number,
                        player1_id, player2_id, status
                     ) VALUES (
                        :championship_id, :round_number, :match_number,
                        :player1_id, :player2_id, :status
                     )'
                );
                $insert->execute([
                    'championship_id' => $championshipId,
                    'round_number' => $round,
                    'match_number' => $matchNumber,
                    'player1_id' => $player1Id,
                    'player2_id' => $player2Id,
                    'status' => 'pending',
                ]);

                $roundMatchIds[$round][$matchNumber] = (int)$pdo->lastInsertId();
            }
        }

        for ($round = 1; $round < $totalRounds; $round++) {
            foreach ($roundMatchIds[$round] as $matchNumber => $matchId) {
                $nextRoundMatchNumber = (int)ceil($matchNumber / 2);
                $nextMatchId = $roundMatchIds[$round + 1][$nextRoundMatchNumber];
                $nextSlot = ($matchNumber % 2 === 1) ? 'player1' : 'player2';

                $pdo->prepare(
                    'UPDATE matches
                     SET next_match_id = :next_match_id, next_slot = :next_slot
                     WHERE id = :id'
                )->execute([
                    'next_match_id' => $nextMatchId,
                    'next_slot' => $nextSlot,
                    'id' => $matchId,
                ]);
            }
        }

        resolveByes($championshipId);

        if ($startedTransaction) {
            $pdo->commit();
        }

        return [true, 'Mata-mata da fase final gerado com sucesso.'];
    } catch (Throwable $e) {
        if ($startedTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return [false, 'Erro ao gerar mata-mata da fase final: ' . $e->getMessage()];
    }
}

function confirmBracket(int $championshipId): array
{
    $championship = getChampionship($championshipId);
    if (!$championship) {
        return [false, 'Campeonato não encontrado.'];
    }

    if ($championship['status'] !== 'setup') {
        return [false, 'A chave já foi confirmada ou finalizada.'];
    }

    $format = normalizeChampionshipFormat($championship['organization_type'] ?? 'knockout');

    $countStmt = db()->prepare('SELECT COUNT(*) FROM matches WHERE championship_id = :championship_id');
    $countStmt->execute(['championship_id' => $championshipId]);

    if ((int)$countStmt->fetchColumn() === 0) {
        return [false, 'Gere a chave antes de confirmar.'];
    }

    db()->prepare("UPDATE championships SET status = 'confirmed' WHERE id = :id")
        ->execute(['id' => $championshipId]);

    if ($format === 'knockout') {
        resolveByes($championshipId);
    }
    updateChampionshipStatusAfterMatches($championshipId);

    return [true, 'Chave confirmada com sucesso.'];
}

function resolveByes(int $championshipId): void
{
    $changed = true;

    while ($changed) {
        $changed = false;

        $stmt = db()->prepare(
            "SELECT *
             FROM matches
             WHERE championship_id = :championship_id
                             AND group_number IS NULL
               AND status = 'pending'
               AND (
                    (player1_id IS NOT NULL AND player2_id IS NULL)
                 OR (player1_id IS NULL AND player2_id IS NOT NULL)
               )
             ORDER BY round_number, match_number"
        );
        $stmt->execute(['championship_id' => $championshipId]);
        $autoMatches = $stmt->fetchAll();

        foreach ($autoMatches as $match) {
            $winnerId = $match['player1_id'] ?: $match['player2_id'];
            if (!$winnerId) {
                continue;
            }

            db()->prepare(
                "UPDATE matches
                 SET winner_id = :winner_id,
                     is_bye = 1,
                     status = 'completed'
                 WHERE id = :id"
            )->execute([
                'winner_id' => $winnerId,
                'id' => $match['id'],
            ]);

            advanceWinner((int)$match['id'], (int)$winnerId);
            $changed = true;
        }
    }
}

function resetPathFromNextMatch(int $matchId): void
{
    $current = db()->prepare('SELECT next_match_id FROM matches WHERE id = :id');
    $current->execute(['id' => $matchId]);
    $nextMatchId = $current->fetchColumn();

    while ($nextMatchId) {
        db()->prepare(
            "UPDATE matches
             SET winner_id = NULL,
                 is_bye = 0,
                 status = 'pending',
                 sets_p1 = NULL,
                 sets_p2 = NULL,
                 total_points_p1 = NULL,
                 total_points_p2 = NULL,
                 set_details = NULL
             WHERE id = :id"
        )->execute(['id' => $nextMatchId]);

        $nextStmt = db()->prepare('SELECT next_match_id FROM matches WHERE id = :id');
        $nextStmt->execute(['id' => $nextMatchId]);
        $nextMatchId = $nextStmt->fetchColumn();
    }
}

function advanceWinner(int $matchId, int $winnerId): void
{
    $stmt = db()->prepare('SELECT next_match_id, next_slot FROM matches WHERE id = :id');
    $stmt->execute(['id' => $matchId]);
    $link = $stmt->fetch();

    if (!$link || !$link['next_match_id'] || !$link['next_slot']) {
        return;
    }

    $slot = $link['next_slot'] === 'player2' ? 'player2_id' : 'player1_id';
    $sql = "UPDATE matches SET {$slot} = :winner_id WHERE id = :next_match_id";

    db()->prepare($sql)->execute([
        'winner_id' => $winnerId,
        'next_match_id' => $link['next_match_id'],
    ]);
}

function saveMatchResult(int $matchId, array $rawSets): array
{
    $matchStmt = db()->prepare(
        'SELECT m.*, c.status AS championship_status, c.organization_type
         FROM matches m
         INNER JOIN championships c ON c.id = m.championship_id
         WHERE m.id = :id'
    );
    $matchStmt->execute(['id' => $matchId]);
    $match = $matchStmt->fetch();

    if (!$match) {
        return [false, 'Partida não encontrada.'];
    }

    if ($match['championship_status'] === 'setup') {
        return [false, 'Confirme a chave antes de registrar resultados.'];
    }

    if (!$match['player1_id'] || !$match['player2_id']) {
        return [false, 'A partida ainda não possui dois jogadores definidos.'];
    }

    $format = normalizeChampionshipFormat($match['organization_type'] ?? 'knockout');
    $isKnockoutMatch = $match['group_number'] === null;

    if ($format === 'groups' && !$isKnockoutMatch) {
        $knockoutCountStmt = db()->prepare(
            'SELECT COUNT(*) FROM matches WHERE championship_id = :championship_id AND group_number IS NULL'
        );
        $knockoutCountStmt->execute(['championship_id' => $match['championship_id']]);
        if ((int)$knockoutCountStmt->fetchColumn() > 0) {
            return [false, 'Após gerar o mata-mata, os resultados da fase de grupos ficam bloqueados para manter a consistência da chave final.'];
        }
    }

    $setDetails = [];
    $setsP1 = 0;
    $setsP2 = 0;
    $totalP1 = 0;
    $totalP2 = 0;

    foreach ($rawSets as $set) {
        if (!isset($set['p1'], $set['p2'])) {
            continue;
        }

        $p1 = trim((string)$set['p1']);
        $p2 = trim((string)$set['p2']);

        if ($p1 === '' || $p2 === '') {
            continue;
        }

        $points1 = (int)$p1;
        $points2 = (int)$p2;

        if ($points1 < 0 || $points2 < 0 || $points1 === $points2) {
            return [false, 'Cada set precisa ter pontuações válidas e diferentes.'];
        }

        $setDetails[] = ['p1' => $points1, 'p2' => $points2];
        $totalP1 += $points1;
        $totalP2 += $points2;

        if ($points1 > $points2) {
            $setsP1++;
        } else {
            $setsP2++;
        }
    }

    if (count($setDetails) === 0) {
        return [false, 'Informe ao menos um set.'];
    }

    if ($setsP1 === $setsP2) {
        return [false, 'Não foi possível definir um vencedor com os sets informados.'];
    }

    $newWinnerId = $setsP1 > $setsP2 ? (int)$match['player1_id'] : (int)$match['player2_id'];
    $oldWinnerId = $match['winner_id'] ? (int)$match['winner_id'] : null;

    try {
        db()->beginTransaction();

        db()->prepare(
            "UPDATE matches
             SET winner_id = :winner_id,
                 is_bye = 0,
                 status = 'completed',
                 sets_p1 = :sets_p1,
                 sets_p2 = :sets_p2,
                 total_points_p1 = :total_points_p1,
                 total_points_p2 = :total_points_p2,
                 set_details = :set_details
             WHERE id = :id"
        )->execute([
            'winner_id' => $newWinnerId,
            'sets_p1' => $setsP1,
            'sets_p2' => $setsP2,
            'total_points_p1' => $totalP1,
            'total_points_p2' => $totalP2,
            'set_details' => json_encode($setDetails, JSON_UNESCAPED_UNICODE),
            'id' => $matchId,
        ]);

        if ($format === 'knockout' || $isKnockoutMatch) {
            if ($oldWinnerId !== null && $oldWinnerId !== $newWinnerId) {
                resetPathFromNextMatch($matchId);
            }

            advanceWinner($matchId, $newWinnerId);
            resolveByes((int)$match['championship_id']);
        }

        updateChampionshipStatusAfterMatches((int)$match['championship_id']);

        db()->commit();
        return [true, 'Resultado salvo com sucesso.'];
    } catch (Throwable $e) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }

        return [false, 'Erro ao salvar resultado: ' . $e->getMessage()];
    }
}

function updateChampionshipStatusAfterMatches(int $championshipId): void
{
    $championship = getChampionship($championshipId);
    if (!$championship) {
        return;
    }

    $format = normalizeChampionshipFormat($championship['organization_type'] ?? 'knockout');

    if ($format === 'groups') {
        $groupTotalStmt = db()->prepare(
            'SELECT COUNT(*) FROM matches WHERE championship_id = :championship_id AND group_number IS NOT NULL'
        );
        $groupTotalStmt->execute(['championship_id' => $championshipId]);
        $groupTotal = (int)$groupTotalStmt->fetchColumn();

        if ($groupTotal === 0) {
            return;
        }

        $groupCompletedStmt = db()->prepare(
            "SELECT COUNT(*)
             FROM matches
             WHERE championship_id = :championship_id
               AND group_number IS NOT NULL
               AND status = 'completed'"
        );
        $groupCompletedStmt->execute(['championship_id' => $championshipId]);
        $groupCompleted = (int)$groupCompletedStmt->fetchColumn();

        if ($groupCompleted < $groupTotal) {
            db()->prepare("UPDATE championships SET status = 'confirmed' WHERE id = :id")
                ->execute(['id' => $championshipId]);
            return;
        }

        $knockoutCountStmt = db()->prepare(
            'SELECT COUNT(*) FROM matches WHERE championship_id = :championship_id AND group_number IS NULL'
        );
        $knockoutCountStmt->execute(['championship_id' => $championshipId]);
        $knockoutCount = (int)$knockoutCountStmt->fetchColumn();

        if ($knockoutCount === 0) {
            $qualifiersPerGroup = getGroupQualifiersCount($championship);
            $qualifiedRows = getGroupQualifiedRowsForKnockout($championshipId, $qualifiersPerGroup);
            if (count($qualifiedRows) >= 2) {
                [$ok] = generateKnockoutFromGroupStage($championshipId);
                if ($ok) {
                    db()->prepare("UPDATE championships SET status = 'confirmed' WHERE id = :id")
                        ->execute(['id' => $championshipId]);
                    return;
                }
            }

            db()->prepare("UPDATE championships SET status = 'finished' WHERE id = :id")
                ->execute(['id' => $championshipId]);
            return;
        }

        $maxRoundStmt = db()->prepare(
            'SELECT MAX(round_number) FROM matches WHERE championship_id = :championship_id AND group_number IS NULL'
        );
        $maxRoundStmt->execute(['championship_id' => $championshipId]);
        $maxRound = (int)$maxRoundStmt->fetchColumn();

        if ($maxRound === 0) {
            db()->prepare("UPDATE championships SET status = 'confirmed' WHERE id = :id")
                ->execute(['id' => $championshipId]);
            return;
        }

        $finalStmt = db()->prepare(
            "SELECT *
             FROM matches
             WHERE championship_id = :championship_id
               AND group_number IS NULL
               AND round_number = :round_number
               AND match_number = 1"
        );
        $finalStmt->execute([
            'championship_id' => $championshipId,
            'round_number' => $maxRound,
        ]);
        $final = $finalStmt->fetch();

        if ($final && $final['status'] === 'completed' && $final['winner_id']) {
            db()->prepare("UPDATE championships SET status = 'finished' WHERE id = :id")
                ->execute(['id' => $championshipId]);
            return;
        }

        db()->prepare("UPDATE championships SET status = 'confirmed' WHERE id = :id")
            ->execute(['id' => $championshipId]);
        return;
    }

    $maxRoundStmt = db()->prepare('SELECT MAX(round_number) FROM matches WHERE championship_id = :championship_id');
    $maxRoundStmt->execute(['championship_id' => $championshipId]);
    $maxRound = (int)$maxRoundStmt->fetchColumn();

    if ($maxRound === 0) {
        return;
    }

    $finalStmt = db()->prepare(
        "SELECT * FROM matches
         WHERE championship_id = :championship_id
           AND round_number = :round_number
           AND match_number = 1"
    );
    $finalStmt->execute([
        'championship_id' => $championshipId,
        'round_number' => $maxRound,
    ]);
    $final = $finalStmt->fetch();

    if ($final && $final['status'] === 'completed' && $final['winner_id']) {
        db()->prepare("UPDATE championships SET status = 'finished' WHERE id = :id")
            ->execute(['id' => $championshipId]);
        return;
    }

    db()->prepare("UPDATE championships SET status = 'confirmed' WHERE id = :id")
        ->execute(['id' => $championshipId]);
}

function getFinalClassification(int $championshipId): ?array
{
    $championship = getChampionship($championshipId);
    if (!$championship || $championship['status'] !== 'finished') {
        return null;
    }

    $format = normalizeChampionshipFormat($championship['organization_type'] ?? 'knockout');

    if ($format === 'groups') {
        $knockoutCountStmt = db()->prepare(
            'SELECT COUNT(*) FROM matches WHERE championship_id = :championship_id AND group_number IS NULL'
        );
        $knockoutCountStmt->execute(['championship_id' => $championshipId]);
        $knockoutCount = (int)$knockoutCountStmt->fetchColumn();

        if ($knockoutCount === 0) {
            $standings = getGroupStandings($championshipId);
            $overall = $standings['overall'];

            if (count($overall) < 2) {
                return null;
            }

            return [
                'champion' => $overall[0]['name'],
                'runner_up' => $overall[1]['name'],
                'third_places' => isset($overall[2]) ? [$overall[2]['name']] : [],
            ];
        }

        $maxRoundStmt = db()->prepare(
            'SELECT MAX(round_number) FROM matches WHERE championship_id = :championship_id AND group_number IS NULL'
        );
        $maxRoundStmt->execute(['championship_id' => $championshipId]);
        $maxRound = (int)$maxRoundStmt->fetchColumn();

        if ($maxRound === 0) {
            return null;
        }

        $finalStmt = db()->prepare(
            "SELECT m.*, p1.name AS player1_name, p2.name AS player2_name, w.name AS winner_name
             FROM matches m
             LEFT JOIN players p1 ON p1.id = m.player1_id
             LEFT JOIN players p2 ON p2.id = m.player2_id
             LEFT JOIN players w ON w.id = m.winner_id
             WHERE m.championship_id = :championship_id
               AND m.group_number IS NULL
               AND m.round_number = :round_number
               AND m.match_number = 1"
        );
        $finalStmt->execute([
            'championship_id' => $championshipId,
            'round_number' => $maxRound,
        ]);
        $final = $finalStmt->fetch();

        if (!$final || !$final['winner_id']) {
            return null;
        }

        $runnerUpName = ((int)$final['winner_id'] === (int)$final['player1_id'])
            ? ($final['player2_name'] ?? '-')
            : ($final['player1_name'] ?? '-');

        $thirdPlace = [];
        if ($maxRound > 1) {
            $semiStmt = db()->prepare(
                "SELECT m.*, p1.name AS player1_name, p2.name AS player2_name
                 FROM matches m
                 LEFT JOIN players p1 ON p1.id = m.player1_id
                 LEFT JOIN players p2 ON p2.id = m.player2_id
                 WHERE m.championship_id = :championship_id
                   AND m.group_number IS NULL
                   AND m.round_number = :semi_round"
            );
            $semiStmt->execute([
                'championship_id' => $championshipId,
                'semi_round' => $maxRound - 1,
            ]);

            foreach ($semiStmt->fetchAll() as $semi) {
                if (!$semi['winner_id']) {
                    continue;
                }

                $loser = ((int)$semi['winner_id'] === (int)$semi['player1_id'])
                    ? ($semi['player2_name'] ?? null)
                    : ($semi['player1_name'] ?? null);

                if ($loser) {
                    $thirdPlace[] = $loser;
                }
            }
        }

        return [
            'champion' => $final['winner_name'],
            'runner_up' => $runnerUpName,
            'third_places' => $thirdPlace,
        ];
    }

    $maxRoundStmt = db()->prepare('SELECT MAX(round_number) FROM matches WHERE championship_id = :championship_id');
    $maxRoundStmt->execute(['championship_id' => $championshipId]);
    $maxRound = (int)$maxRoundStmt->fetchColumn();

    if ($maxRound === 0) {
        return null;
    }

    $finalStmt = db()->prepare(
        "SELECT m.*, p1.name AS player1_name, p2.name AS player2_name, w.name AS winner_name
         FROM matches m
         LEFT JOIN players p1 ON p1.id = m.player1_id
         LEFT JOIN players p2 ON p2.id = m.player2_id
         LEFT JOIN players w ON w.id = m.winner_id
         WHERE m.championship_id = :championship_id
           AND m.round_number = :round_number
           AND m.match_number = 1"
    );
    $finalStmt->execute([
        'championship_id' => $championshipId,
        'round_number' => $maxRound,
    ]);
    $final = $finalStmt->fetch();

    if (!$final || !$final['winner_id']) {
        return null;
    }

    $runnerUpName = ((int)$final['winner_id'] === (int)$final['player1_id'])
        ? ($final['player2_name'] ?? '-')
        : ($final['player1_name'] ?? '-');

    $thirdPlace = [];
    if ($maxRound > 1) {
        $semiStmt = db()->prepare(
            "SELECT m.*, p1.name AS player1_name, p2.name AS player2_name
             FROM matches m
             LEFT JOIN players p1 ON p1.id = m.player1_id
             LEFT JOIN players p2 ON p2.id = m.player2_id
             WHERE m.championship_id = :championship_id
               AND m.round_number = :semi_round"
        );
        $semiStmt->execute([
            'championship_id' => $championshipId,
            'semi_round' => $maxRound - 1,
        ]);

        foreach ($semiStmt->fetchAll() as $semi) {
            if (!$semi['winner_id']) {
                continue;
            }

            $loser = ((int)$semi['winner_id'] === (int)$semi['player1_id'])
                ? ($semi['player2_name'] ?? null)
                : ($semi['player1_name'] ?? null);

            if ($loser) {
                $thirdPlace[] = $loser;
            }
        }
    }

    return [
        'champion' => $final['winner_name'],
        'runner_up' => $runnerUpName,
        'third_places' => $thirdPlace,
    ];
}

function getGroupStandings(int $championshipId): array
{
    $participants = getChampionshipParticipants($championshipId);
    $matches = getMatchesByChampionship($championshipId);
    $groupedMatches = groupMatchesByGroup($matches);

    $playersById = [];
    foreach ($participants as $participant) {
        $playersById[(int)$participant['id']] = $participant;
    }

    $groupStats = [];
    $playerGroupMap = [];

    foreach ($groupedMatches as $groupNumber => $groupMatches) {
        foreach ($groupMatches as $match) {
            $p1Id = $match['player1_id'] ? (int)$match['player1_id'] : null;
            $p2Id = $match['player2_id'] ? (int)$match['player2_id'] : null;

            if ($p1Id !== null) {
                $playerGroupMap[$p1Id] = $groupNumber;
            }
            if ($p2Id !== null) {
                $playerGroupMap[$p2Id] = $groupNumber;
            }
        }
    }

    foreach ($playerGroupMap as $playerId => $groupNumber) {
        if (!isset($groupStats[$groupNumber])) {
            $groupStats[$groupNumber] = [];
        }

        $playerName = $playersById[$playerId]['name'] ?? ('Jogador #' . $playerId);
        $groupStats[$groupNumber][$playerId] = [
            'player_id' => $playerId,
            'name' => $playerName,
            'played' => 0,
            'wins' => 0,
            'losses' => 0,
            'sets_for' => 0,
            'sets_against' => 0,
            'points_for' => 0,
            'points_against' => 0,
        ];
    }

    foreach ($groupedMatches as $groupNumber => $groupMatches) {
        foreach ($groupMatches as $match) {
            $p1Id = $match['player1_id'] ? (int)$match['player1_id'] : null;
            $p2Id = $match['player2_id'] ? (int)$match['player2_id'] : null;

            if ($p1Id === null || $p2Id === null || $match['status'] !== 'completed') {
                continue;
            }

            $s1 = (int)$match['sets_p1'];
            $s2 = (int)$match['sets_p2'];
            $t1 = (int)$match['total_points_p1'];
            $t2 = (int)$match['total_points_p2'];
            $winnerId = $match['winner_id'] ? (int)$match['winner_id'] : null;

            $groupStats[$groupNumber][$p1Id]['played']++;
            $groupStats[$groupNumber][$p2Id]['played']++;

            $groupStats[$groupNumber][$p1Id]['sets_for'] += $s1;
            $groupStats[$groupNumber][$p1Id]['sets_against'] += $s2;
            $groupStats[$groupNumber][$p2Id]['sets_for'] += $s2;
            $groupStats[$groupNumber][$p2Id]['sets_against'] += $s1;

            $groupStats[$groupNumber][$p1Id]['points_for'] += $t1;
            $groupStats[$groupNumber][$p1Id]['points_against'] += $t2;
            $groupStats[$groupNumber][$p2Id]['points_for'] += $t2;
            $groupStats[$groupNumber][$p2Id]['points_against'] += $t1;

            if ($winnerId === $p1Id) {
                $groupStats[$groupNumber][$p1Id]['wins']++;
                $groupStats[$groupNumber][$p2Id]['losses']++;
            } elseif ($winnerId === $p2Id) {
                $groupStats[$groupNumber][$p2Id]['wins']++;
                $groupStats[$groupNumber][$p1Id]['losses']++;
            }
        }
    }

    $sortStandings = static function (array &$items): void {
        usort($items, static function (array $a, array $b): int {
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

            if ($a['points_for'] !== $b['points_for']) {
                return $b['points_for'] <=> $a['points_for'];
            }

            return strcmp($a['name'], $b['name']);
        });
    };

    $groupResult = [];
    $overall = [];

    foreach ($groupStats as $groupNumber => $playersStats) {
        $list = array_values($playersStats);
        $sortStandings($list);

        $groupResult[$groupNumber] = $list;
        foreach ($list as $row) {
            $overall[] = $row;
        }
    }

    $sortStandings($overall);

    return [
        'groups' => $groupResult,
        'overall' => $overall,
    ];
}
