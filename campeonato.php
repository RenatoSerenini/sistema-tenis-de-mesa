<?php

declare(strict_types=1);

require_once __DIR__ . '/includes/functions.php';

$championshipId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$championship = $championshipId > 0 ? getChampionship($championshipId) : null;

if (!$championship) {
    redirect('campeonatos.php');
}

$message = isset($_GET['flash_message']) ? trim((string)$_GET['flash_message']) : null;
$messageType = (($_GET['flash_type'] ?? 'success') === 'error') ? 'error' : 'success';
$showToast = isset($_GET['flash_message']);
$isGroupStage = normalizeChampionshipFormat($championship['organization_type'] ?? 'knockout') === 'groups';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $redirectAnchor = '';

    try {
        if ($action === 'update_participants') {
            if ($championship['status'] !== 'setup') {
                throw new RuntimeException('Participantes só podem ser alterados antes da confirmação da chave.');
            }

            $selected = $_POST['participants'] ?? [];
            $selectedIds = array_map('intval', is_array($selected) ? $selected : []);

            $pdo = db();
            $pdo->beginTransaction();

            $pdo->prepare('DELETE FROM championship_players WHERE championship_id = :championship_id')
                ->execute(['championship_id' => $championshipId]);

            $insert = $pdo->prepare(
                'INSERT IGNORE INTO championship_players (championship_id, player_id) VALUES (:championship_id, :player_id)'
            );

            foreach ($selectedIds as $playerId) {
                if ($playerId <= 0) {
                    continue;
                }
                $insert->execute([
                    'championship_id' => $championshipId,
                    'player_id' => $playerId,
                ]);
            }

            $pdo->prepare('DELETE FROM matches WHERE championship_id = :championship_id')
                ->execute(['championship_id' => $championshipId]);
            $pdo->prepare('DELETE FROM championship_group_assignments WHERE championship_id = :championship_id')
                ->execute(['championship_id' => $championshipId]);
            $pdo->prepare(
                'UPDATE championships SET group_assignment_mode = :group_assignment_mode WHERE id = :id'
            )->execute([
                'group_assignment_mode' => 'auto',
                'id' => $championshipId,
            ]);

            $pdo->commit();
            $message = 'Participantes atualizados. Gere a chave novamente para continuar.';
        }

        if ($action === 'save_manual_groups') {
            if ($championship['organization_type'] !== 'groups') {
                throw new RuntimeException('A definição manual de chaves é válida apenas para campeonatos em fase de grupos.');
            }

            $groups = $_POST['groups'] ?? [];
            if (!is_array($groups)) {
                throw new RuntimeException('Estrutura de chaves inválida.');
            }

            [$ok, $msg] = saveManualGroupAssignments($championshipId, $groups);
            if (!$ok) {
                throw new RuntimeException($msg);
            }

            $message = $msg;
        }

        if ($action === 'generate_bracket') {
            [$ok, $msg] = generateBracketSuggestion($championshipId);
            if (!$ok) {
                throw new RuntimeException($msg);
            }
            $message = $msg;
        }

        if ($action === 'save_round1') {
            if ($isGroupStage) {
                throw new RuntimeException('Este campeonato está no modo fase de grupos e não usa ajuste manual de chave eliminatória.');
            }

            if ($championship['status'] !== 'setup') {
                throw new RuntimeException('A chave não pode mais ser alterada.');
            }

            $player1 = $_POST['player1'] ?? [];
            $player2 = $_POST['player2'] ?? [];

            if (!is_array($player1) || !is_array($player2)) {
                throw new RuntimeException('Dados de confrontos inválidos.');
            }

            $pdo = db();
            $pdo->beginTransaction();

            $update = $pdo->prepare(
                'UPDATE matches
                 SET player1_id = :player1_id,
                     player2_id = :player2_id,
                     winner_id = NULL,
                     status = :status,
                     is_bye = 0,
                     sets_p1 = NULL,
                     sets_p2 = NULL,
                     total_points_p1 = NULL,
                     total_points_p2 = NULL,
                     set_details = NULL
                 WHERE id = :id AND championship_id = :championship_id AND round_number = 1'
            );

            foreach ($player1 as $matchId => $p1) {
                $matchId = (int)$matchId;
                $p1Id = trim((string)$p1) === '' ? null : (int)$p1;
                $p2Val = $player2[$matchId] ?? '';
                $p2Id = trim((string)$p2Val) === '' ? null : (int)$p2Val;

                $update->execute([
                    'player1_id' => $p1Id,
                    'player2_id' => $p2Id,
                    'status' => 'pending',
                    'id' => $matchId,
                    'championship_id' => $championshipId,
                ]);
            }

            resetRoundsAfterFirstRound($championshipId);

            $pdo->commit();
            $message = 'Confrontos da primeira fase atualizados com sucesso.';
        }

        if ($action === 'confirm_bracket') {
            [$ok, $msg] = confirmBracket($championshipId);
            if (!$ok) {
                throw new RuntimeException($msg);
            }
            $message = $msg;
        }

        if ($action === 'save_result') {
            $matchId = (int)($_POST['match_id'] ?? 0);
            if ($matchId > 0) {
                $redirectAnchor = 'match-' . $matchId;
            }
            $sets = [];

            for ($i = 1; $i <= 5; $i++) {
                $sets[] = [
                    'p1' => $_POST['set_' . $i . '_p1'] ?? '',
                    'p2' => $_POST['set_' . $i . '_p2'] ?? '',
                ];
            }

            [$ok, $msg] = saveMatchResult($matchId, $sets);
            if (!$ok) {
                throw new RuntimeException($msg);
            }
            $message = $msg;
        }
    } catch (Throwable $e) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }
        $messageType = 'error';
        $message = $e->getMessage();
    }

    $championship = getChampionship($championshipId);
    $isGroupStage = normalizeChampionshipFormat($championship['organization_type'] ?? 'knockout') === 'groups';

    $flashMessage = $message ?? 'Operação concluída.';
    $query = http_build_query([
        'id' => $championshipId,
        'flash_type' => $messageType,
        'flash_message' => $flashMessage,
    ]);

    $target = 'campeonato.php?' . $query;
    if ($redirectAnchor !== '') {
        $target .= '#' . $redirectAnchor;
    }

    redirect($target);
}

$pageTitle = 'Campeonato';

$allPlayers = db()->query('SELECT * FROM players ORDER BY name')->fetchAll();
$participants = getChampionshipParticipants($championshipId);
$participantIds = array_map(static fn(array $p): int => (int)$p['id'], $participants);
$manualGroups = getManualGroupAssignments($championshipId);
$groupAssignmentMode = normalizeGroupAssignmentMode($championship['group_assignment_mode'] ?? 'auto');

$matches = getMatchesByChampionship($championshipId);
$groupStageMatches = array_values(array_filter(
    $matches,
    static fn(array $m): bool => $m['group_number'] !== null
));
$knockoutMatches = array_values(array_filter(
    $matches,
    static fn(array $m): bool => $m['group_number'] === null
));

$groupedMatches = groupMatchesByRound($matches);
$knockoutGroupedMatches = groupMatchesByRound($knockoutMatches);
$groupMatchesByGroup = groupMatchesByGroup($groupStageMatches);
$totalRounds = $groupedMatches ? max(array_keys($groupedMatches)) : 0;
$knockoutTotalRounds = $knockoutGroupedMatches ? max(array_keys($knockoutGroupedMatches)) : 0;
$firstRound = $groupedMatches[1] ?? [];
$groupStandings = $isGroupStage ? getGroupStandings($championshipId) : ['groups' => [], 'overall' => []];
$groupQualifiersCount = $isGroupStage ? getGroupQualifiersCount($championship) : null;
$hasGroupKnockout = $isGroupStage && !empty($knockoutMatches);

$classification = getFinalClassification($championshipId);
$matchesCount = count($matches);
$completedMatchesCount = count(array_filter($matches, static fn(array $m): bool => $m['status'] === 'completed'));
$pendingMatchesCount = $matchesCount - $completedMatchesCount;

require __DIR__ . '/includes/header.php';
?>

<?php if ($message): ?>
    <div class="alert <?= h($messageType) ?>"><?= h($message) ?></div>
<?php endif; ?>

<?php if ($showToast && $message): ?>
    <div id="flash-toast" class="toast <?= h($messageType) ?>" role="status" aria-live="polite"><?= h($message) ?></div>
    <script>
        (function () {
            const toast = document.getElementById('flash-toast');
            if (toast) {
                window.setTimeout(() => {
                    toast.remove();
                }, 4500);
            }

            const url = new URL(window.location.href);
            url.searchParams.delete('flash_type');
            url.searchParams.delete('flash_message');
            const clean = url.pathname + (url.search ? '?' + url.searchParams.toString() : '') + url.hash;
            window.history.replaceState({}, '', clean);

            if (window.location.hash) {
                const target = document.querySelector(window.location.hash);
                if (target) {
                    const details = target.closest('details');
                    if (details) {
                        details.open = true;
                    }
                    const parentDetails = details ? details.closest('details') : null;
                    if (parentDetails) {
                        parentDetails.open = true;
                    }
                }
            }
        })();
    </script>
<?php endif; ?>

<section class="stats-grid">
    <article class="stat-box">
        <small>Participantes</small>
        <strong><?= count($participants) ?></strong>
    </article>
    <article class="stat-box">
        <small>Partidas totais</small>
        <strong><?= $matchesCount ?></strong>
    </article>
    <article class="stat-box">
        <small>Partidas finalizadas</small>
        <strong><?= $completedMatchesCount ?></strong>
    </article>
    <article class="stat-box">
        <small>Pendentes</small>
        <strong><?= $pendingMatchesCount ?></strong>
    </article>
</section>

<section class="card">
    <h2><?= h($championship['name']) ?></h2>
    <p>Data: <strong><?= h($championship['championship_date']) ?></strong></p>
    <p>Formato: <strong><?= h(championshipFormatLabel($championship['organization_type'] ?? 'knockout')) ?></strong></p>
    <?php if ($isGroupStage): ?>
        <p>Tamanho preferido dos grupos: <strong><?= (int)($championship['preferred_group_size'] ?? 4) ?></strong></p>
        <p>Classificados por grupo para o mata-mata: <strong><?= (int)$groupQualifiersCount ?></strong></p>
    <?php endif; ?>
    <p>Status: <span class="badge <?= h($championship['status']) ?>"><?= h(statusLabel($championship['status'])) ?></span></p>
</section>

<section class="grid-two" style="margin-top:16px;">
    <div class="card">
        <h3>Participantes</h3>
        <?php if ($championship['status'] === 'setup'): ?>
            <form method="post">
                <input type="hidden" name="action" value="update_participants">
                <div class="participant-grid">
                    <?php foreach ($allPlayers as $player): ?>
                        <label class="participant-item">
                            <input type="checkbox" name="participants[]" value="<?= (int)$player['id'] ?>"
                                <?= in_array((int)$player['id'], $participantIds, true) ? 'checked' : '' ?>>
                            <span><?= h($player['name']) ?> (<?= h($player['category']) ?>)</span>
                        </label>
                    <?php endforeach; ?>
                </div>
                <button type="submit">Salvar participantes</button>
            </form>
        <?php else: ?>
            <ul>
                <?php foreach ($participants as $participant): ?>
                    <li><?= h($participant['name']) ?> (<?= h($participant['category']) ?>)</li>
                <?php endforeach; ?>
            </ul>
        <?php endif; ?>
    </div>

    <div class="card">
        <h3>Controle da chave</h3>
        <?php if ($championship['status'] === 'setup'): ?>
            <?php if ($isGroupStage): ?>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
                    <span class="badge <?= h($groupAssignmentMode === 'manual' ? 'manual' : 'auto') ?>">
                        <?= h($groupAssignmentMode === 'manual' ? 'Manual' : 'Automático') ?>
                    </span>
                </div>
                <form method="post">
                    <input type="hidden" name="action" value="generate_bracket">
                    <button type="submit"><?= $groupAssignmentMode === 'manual' ? 'Gerar confrontos com as chaves salvas' : 'Gerar confrontos sugeridos por grupo' ?></button>
                </form>
            <?php else: ?>
                <form method="post">
                    <input type="hidden" name="action" value="generate_bracket">
                    <button type="submit">Gerar chave sugerida</button>
                </form>
            <?php endif; ?>

            <?php if ($matches): ?>
                <form method="post" style="margin-top:10px;">
                    <input type="hidden" name="action" value="confirm_bracket">
                    <button type="submit" data-confirm="Ao confirmar, a chave não poderá ser alterada. Deseja continuar?">Confirmar chave oficial</button>
                </form>
            <?php endif; ?>
        <?php else: ?>
            <p>A estrutura da disputa já foi confirmada e está bloqueada para alterações.</p>
        <?php endif; ?>
    </div>
</section>

<?php if ($isGroupStage && $championship['status'] === 'setup'): ?>
<section class="card" style="margin-top:16px;">
    <h3>Definição manual de chaves</h3>
    <p>Escolha a opção <strong>Definir chaves manualmente</strong> no cadastro do campeonato e distribua os participantes abaixo para cada grupo, preservando a ordem interna.</p>

    <form method="post" id="manual-groups-form">
        <input type="hidden" name="action" value="save_manual_groups">

        <div style="display:grid; grid-template-columns: minmax(220px, 1.1fr) minmax(260px, 2fr); gap:16px; margin-top:12px;">
            <div class="card" style="padding:12px; margin:0; background:#f7faf8; border:1px solid #dfe9e2;">
                <h4>Participantes disponíveis</h4>
                <div id="available-players" style="display:flex; flex-direction:column; gap:8px; min-height:120px;">
                    <?php foreach ($participants as $player): ?>
                        <?php $alreadyAssigned = false; foreach ($manualGroups as $groupPlayers): foreach ($groupPlayers as $assignedId): if ((int)$assignedId === (int)$player['id']) { $alreadyAssigned = true; break 2; } endforeach; endforeach; ?>
                        <div class="participant-item" data-player-id="<?= (int)$player['id'] ?>" <?= $alreadyAssigned ? 'hidden' : '' ?>>
                            <span><?= h($player['name']) ?></span>
                            <select aria-label="Grupo para <?= h($player['name']) ?>" data-select-group>
                                <option value="">Selecionar grupo</option>
                                <?php for ($g = 1; $g <= 8; $g++): ?>
                                    <option value="<?= $g ?>">Chave <?= chr(64 + $g) ?></option>
                                <?php endfor; ?>
                            </select>
                            <button type="button" class="btn-small" data-add-player="<?= (int)$player['id'] ?>">Adicionar</button>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>

            <div class="card" style="padding:12px; margin:0; background:#f7faf8; border:1px solid #dfe9e2;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px;">
                    <h4 style="margin:0;">Chaves</h4>
                    <button type="button" id="add-group-btn" class="btn-small secondary">Adicionar chave</button>
                </div>
                <div id="groups-container" style="display:flex; flex-direction:column; gap:12px;"></div>
            </div>
        </div>

        <div style="margin-top:16px; display:flex; justify-content:flex-end;">
            <button type="submit">Salvar configuração das chaves</button>
        </div>
    </form>
</section>

<script>
(function () {
    const groupsContainer = document.getElementById('groups-container');
    const addGroupBtn = document.getElementById('add-group-btn');
    const form = document.getElementById('manual-groups-form');
    const availablePlayersWrap = document.getElementById('available-players');
    const playerIndex = <?php echo json_encode(array_map(static fn(array $p): array => ['id' => (int)$p['id'], 'name' => $p['name']], $participants), JSON_UNESCAPED_UNICODE); ?>;
    const initialGroups = <?php echo json_encode($manualGroups, JSON_UNESCAPED_UNICODE); ?>;

    const groupLabel = (number) => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return alphabet[(number - 1) % 26] || 'G' + number;
    };

    const getPlayerName = (playerId) => {
        const player = playerIndex.find((item) => Number(item.id) === Number(playerId));
        return player ? player.name : 'Jogador';
    };

    const createGroup = (groupNumber, assignedIds = []) => {
        const group = document.createElement('div');
        group.className = 'group-editor';
        group.dataset.groupNumber = String(groupNumber);
        group.style.border = '1px solid #dfe9e2';
        group.style.background = '#fff';
        group.style.borderRadius = '8px';
        group.style.padding = '10px';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '8px';

        const title = document.createElement('strong');
        title.textContent = 'Chave ' + groupLabel(groupNumber);
        header.appendChild(title);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = 'Remover chave';
        removeButton.className = 'btn-small btn-secondary';
        removeButton.addEventListener('click', () => {
            if (group.querySelectorAll('[data-player-item]').length === 0) {
                group.remove();
                syncGroupFields();
                return;
            }
            const confirmed = window.confirm('A chave contém participantes. Deseja remover a chave e devolver os jogadores para a lista disponível?');
            if (!confirmed) return;
            Array.from(group.querySelectorAll('[data-player-item]')).forEach((item) => {
                const playerId = item.dataset.playerId;
                const available = document.querySelector('[data-player-id="' + playerId + '"]');
                if (available) {
                    available.hidden = false;
                }
            });
            group.remove();
            syncGroupFields();
        });
        header.appendChild(removeButton);
        group.appendChild(header);

        const assignedList = document.createElement('div');
        assignedList.style.display = 'flex';
        assignedList.style.flexDirection = 'column';
        assignedList.style.gap = '6px';

        if (!assignedIds.length) {
            const empty = document.createElement('div');
            empty.className = 'muted';
            empty.textContent = 'Nenhum participante nesta chave';
            empty.style.fontSize = '13px';
            empty.style.color = '#6b7280';
            assignedList.appendChild(empty);
        }

        assignedIds.forEach((playerId) => {
            const row = document.createElement('div');
            row.dataset.playerItem = 'true';
            row.dataset.playerId = String(playerId);
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '8px';
            row.style.padding = '6px 8px';
            row.style.borderRadius = '6px';
            row.style.border = '1px solid #edf2f0';
            row.style.background = '#fbfdfc';

            const name = document.createElement('span');
            name.textContent = getPlayerName(playerId);
            name.style.flex = '1';
            row.appendChild(name);

            const up = document.createElement('button');
            up.type = 'button';
            up.textContent = '↑';
            up.title = 'Mover para cima';
            up.addEventListener('click', () => movePlayerBetweenGroups(groupNumber, playerId, -1));

            const down = document.createElement('button');
            down.type = 'button';
            down.textContent = '↓';
            down.title = 'Mover para baixo';
            down.addEventListener('click', () => movePlayerBetweenGroups(groupNumber, playerId, 1));

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = 'Remover';
            remove.addEventListener('click', () => {
                row.remove();
                const available = document.querySelector('[data-player-id="' + playerId + '"]');
                if (available) {
                    available.hidden = false;
                }
                syncGroupFields();
            });

            [up, down, remove].forEach((button) => {
                button.className = 'btn-small';
                row.appendChild(button);
            });

            assignedList.appendChild(row);
        });

        group.appendChild(assignedList);
        return group;
    };

    const syncGroupFields = () => {
        const groups = Array.from(groupsContainer.querySelectorAll('[data-group-number]'));
        const fieldMap = new Map();
        groups.forEach((groupNode, idx) => {
            const groupNumber = Number(groupNode.dataset.groupNumber);
            const rowIds = Array.from(groupNode.querySelectorAll('[data-player-item]')).map((row) => Number(row.dataset.playerId));
            fieldMap.set(groupNumber, rowIds);
        });

        Array.from(form.querySelectorAll('input[data-group-field]')).forEach((el) => el.remove());
        fieldMap.forEach((players, groupNumber) => {
            players.forEach((playerId) => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'groups[' + groupNumber + '][]';
                input.value = String(playerId);
                input.dataset.groupField = 'true';
                form.appendChild(input);
            });
        });
    };

    const movePlayerBetweenGroups = (groupNumber, playerId, direction) => {
        const groupNode = groupsContainer.querySelector('[data-group-number="' + groupNumber + '"]');
        if (!groupNode) return;
        const list = groupNode.querySelectorAll('[data-player-item]');
        const rows = Array.from(list);
        const index = rows.findIndex((row) => Number(row.dataset.playerId) === Number(playerId));
        if (index === -1) return;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= rows.length) return;
        const current = rows[index];
        const next = rows[targetIndex];
        const listContainer = groupNode.lastElementChild;
        listContainer.insertBefore(next, current);
        syncGroupFields();
    };

    const addPlayerToGroup = (playerId, groupNumber) => {
        const targetGroup = groupsContainer.querySelector('[data-group-number="' + groupNumber + '"]');
        if (!targetGroup) return;
        const row = document.createElement('div');
        row.dataset.playerItem = 'true';
        row.dataset.playerId = String(playerId);
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '6px 8px';
        row.style.borderRadius = '6px';
        row.style.border = '1px solid #edf2f0';
        row.style.background = '#fbfdfc';

        const label = document.createElement('span');
        label.textContent = getPlayerName(playerId);
        label.style.flex = '1';
        row.appendChild(label);

        const up = document.createElement('button');
        up.type = 'button';
        up.textContent = '↑';
        up.className = 'btn-small';
        up.addEventListener('click', () => movePlayerBetweenGroups(groupNumber, playerId, -1));

        const down = document.createElement('button');
        down.type = 'button';
        down.textContent = '↓';
        down.className = 'btn-small';
        down.addEventListener('click', () => movePlayerBetweenGroups(groupNumber, playerId, 1));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remover';
        remove.className = 'btn-small';
        remove.addEventListener('click', () => {
            row.remove();
            const available = document.querySelector('[data-player-id="' + playerId + '"]');
            if (available) {
                available.hidden = false;
            }
            syncGroupFields();
        });

        [up, down, remove].forEach((button) => row.appendChild(button));
        const emptyPlaceholder = targetGroup.querySelector('.muted');
        if (emptyPlaceholder) emptyPlaceholder.remove();
        const listContainer = targetGroup.lastElementChild;
        if (listContainer) {
            listContainer.appendChild(row);
        }
        const available = document.querySelector('[data-player-id="' + playerId + '"]');
        if (available) {
            available.hidden = true;
        }
        syncGroupFields();
    };

    const initializeGroups = () => {
        const groupNumbers = Object.keys(initialGroups).length ? Object.keys(initialGroups).map((key) => Number(key)).sort((a, b) => a - b) : [1, 2, 3, 4];
        groupsContainer.innerHTML = '';
        groupNumbers.forEach((groupNumber) => {
            const group = createGroup(groupNumber, initialGroups[groupNumber] || []);
            groupsContainer.appendChild(group);
        });
        if (!groupsContainer.children.length) {
            for (let i = 1; i <= 4; i++) {
                groupsContainer.appendChild(createGroup(i, []));
            }
        }
        syncGroupFields();
    };

    addGroupBtn.addEventListener('click', () => {
        const currentGroups = Array.from(groupsContainer.querySelectorAll('[data-group-number]')).map((node) => Number(node.dataset.groupNumber));
        const nextNumber = currentGroups.length ? Math.max(...currentGroups) + 1 : 1;
        groupsContainer.appendChild(createGroup(nextNumber, []));
        syncGroupFields();
    });

    availablePlayersWrap.querySelectorAll('[data-add-player]').forEach((button) => {
        button.addEventListener('click', () => {
            const playerId = button.dataset.addPlayer;
            const groupSelect = button.parentElement.querySelector('[data-select-group]');
            const groupNumber = groupSelect.value ? Number(groupSelect.value) : 0;
            if (!groupNumber) {
                window.alert('Selecione uma chave antes de adicionar o participante.');
                return;
            }
            const targetGroup = groupsContainer.querySelector('[data-group-number="' + groupNumber + '"]');
            if (!targetGroup) {
                const guest = createGroup(groupNumber, []);
                groupsContainer.appendChild(guest);
            }
            addPlayerToGroup(playerId, groupNumber);
            button.parentElement.hidden = true;
            groupSelect.value = '';
        });
    });

    initializeGroups();
    form.addEventListener('submit', () => {
        syncGroupFields();
    });
})();
</script>
<?php endif; ?>

<?php if (!$isGroupStage && $championship['status'] === 'setup' && $firstRound): ?>
<section class="card" style="margin-top:16px;">
    <h3>Ajuste manual dos confrontos da primeira fase</h3>
    <p>Você pode reorganizar livremente antes da confirmação.</p>

    <form method="post">
        <input type="hidden" name="action" value="save_round1">
        <div class="table-wrap">
            <table>
                <thead>
                <tr>
                    <th>Partida</th>
                    <th>Jogador 1</th>
                    <th>Jogador 2</th>
                </tr>
                </thead>
                <tbody>
                <?php foreach ($firstRound as $match): ?>
                    <tr>
                        <td>#<?= (int)$match['match_number'] ?></td>
                        <td>
                            <select name="player1[<?= (int)$match['id'] ?>]">
                                <option value="">BYE</option>
                                <?php foreach ($participants as $player): ?>
                                    <option value="<?= (int)$player['id'] ?>" <?= ((int)$match['player1_id'] === (int)$player['id']) ? 'selected' : '' ?>>
                                        <?= h($player['name']) ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                        <td>
                            <select name="player2[<?= (int)$match['id'] ?>]">
                                <option value="">BYE</option>
                                <?php foreach ($participants as $player): ?>
                                    <option value="<?= (int)$player['id'] ?>" <?= ((int)$match['player2_id'] === (int)$player['id']) ? 'selected' : '' ?>>
                                        <?= h($player['name']) ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <button type="submit">Salvar reorganização</button>
    </form>
</section>
<?php endif; ?>

<?php if (!$isGroupStage): ?>
    <section class="card" style="margin-top:16px;">
        <h3>Visualização da chave (bracket)</h3>

        <?php if (!$groupedMatches): ?>
            <p>Nenhuma chave gerada ainda.</p>
        <?php else: ?>
            <div class="bracket">
                <div class="bracket-inner">
                    <?php foreach ($groupedMatches as $round => $roundMatches): ?>
                        <div class="round">
                            <h4><?= h(roundLabel((int)$round, (int)$totalRounds)) ?></h4>
                            <?php foreach ($roundMatches as $match): ?>
                                <article class="match-card">
                                    <?php
                                    $p1Winner = $match['winner_id'] && (int)$match['winner_id'] === (int)$match['player1_id'];
                                    $p2Winner = $match['winner_id'] && (int)$match['winner_id'] === (int)$match['player2_id'];
                                    ?>
                                    <div class="match-player <?= $p1Winner ? 'winner' : '' ?>">
                                        <span><?= h($match['player1_name'] ?? 'BYE') ?></span>
                                        <span><?= ($match['sets_p1'] !== null) ? (int)$match['sets_p1'] : '-' ?></span>
                                    </div>
                                    <div class="match-player <?= $p2Winner ? 'winner' : '' ?>">
                                        <span><?= h($match['player2_name'] ?? 'BYE') ?></span>
                                        <span><?= ($match['sets_p2'] !== null) ? (int)$match['sets_p2'] : '-' ?></span>
                                    </div>
                                </article>
                            <?php endforeach; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        <?php endif; ?>
    </section>
<?php else: ?>
    <section class="card" style="margin-top:16px;">
        <h3>Confrontos por grupo</h3>
        <p>Ao concluir todas as partidas de grupos, o sistema monta automaticamente o mata-mata com os classificados definidos no campeonato.</p>

        <details class="fold" open>
            <summary>Exibir confrontos da fase de grupos</summary>
            <div class="fold-content">
                <?php if (!$groupMatchesByGroup): ?>
                    <p>Nenhum confronto gerado ainda.</p>
                <?php else: ?>
                    <?php foreach ($groupMatchesByGroup as $groupNumber => $groupMatches): ?>
                        <h4>Grupo <?= (int)$groupNumber ?></h4>
                        <div class="table-wrap" style="margin-bottom: 12px;">
                            <table>
                                <thead>
                                <tr>
                                    <th>Partida</th>
                                    <th>Confronto</th>
                                    <th>Resultado</th>
                                    <th>Status</th>
                                </tr>
                                </thead>
                                <tbody>
                                <?php foreach ($groupMatches as $match): ?>
                                    <tr>
                                        <td>#<?= (int)$match['match_number'] ?></td>
                                        <td><?= h($match['player1_name'] ?? '-') ?> x <?= h($match['player2_name'] ?? '-') ?></td>
                                        <td>
                                            <?php if ($match['status'] === 'completed'): ?>
                                                <?= (int)$match['sets_p1'] ?> x <?= (int)$match['sets_p2'] ?>
                                            <?php else: ?>
                                                -
                                            <?php endif; ?>
                                        </td>
                                        <td><?= h($match['status'] === 'completed' ? 'Finalizada' : 'Pendente') ?></td>
                                    </tr>
                                <?php endforeach; ?>
                                </tbody>
                            </table>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </details>
    </section>

    <?php if ($groupStandings['groups']): ?>
        <section class="card" style="margin-top:16px;">
            <h3>Classificação parcial por grupo</h3>
            <details class="fold">
                <summary>Exibir classificação por grupo</summary>
                <div class="fold-content">
                    <?php foreach ($groupStandings['groups'] as $groupNumber => $rows): ?>
                        <h4>Grupo <?= (int)$groupNumber ?></h4>
                        <div class="table-wrap" style="margin-bottom: 12px;">
                            <table>
                                <thead>
                                <tr>
                                    <th>Jogador</th>
                                    <th>J</th>
                                    <th>V</th>
                                    <th>D</th>
                                    <th>Sets</th>
                                    <th>Pontos</th>
                                </tr>
                                </thead>
                                <tbody>
                                <?php foreach ($rows as $row): ?>
                                    <tr>
                                        <td><?= h($row['name']) ?></td>
                                        <td><?= (int)$row['played'] ?></td>
                                        <td><?= (int)$row['wins'] ?></td>
                                        <td><?= (int)$row['losses'] ?></td>
                                        <td><?= (int)$row['sets_for'] ?> / <?= (int)$row['sets_against'] ?></td>
                                        <td><?= (int)$row['points_for'] ?> / <?= (int)$row['points_against'] ?></td>
                                    </tr>
                                <?php endforeach; ?>
                                </tbody>
                            </table>
                        </div>
                    <?php endforeach; ?>
                </div>
            </details>
        </section>
    <?php endif; ?>

    <?php if ($hasGroupKnockout): ?>
        <section class="card" style="margin-top:16px;">
            <h3>Fase final (mata-mata)</h3>
            <details class="fold" open>
                <summary>Exibir chave da fase final</summary>
                <div class="fold-content">
                    <?php if (!$knockoutGroupedMatches): ?>
                        <p>A fase final ainda não foi gerada.</p>
                    <?php else: ?>
                        <div class="bracket">
                            <div class="bracket-inner">
                                <?php foreach ($knockoutGroupedMatches as $round => $roundMatches): ?>
                                    <div class="round">
                                        <h4><?= h(roundLabel((int)$round, (int)$knockoutTotalRounds)) ?></h4>
                                        <?php foreach ($roundMatches as $match): ?>
                                            <article class="match-card">
                                                <?php
                                                $p1Winner = $match['winner_id'] && (int)$match['winner_id'] === (int)$match['player1_id'];
                                                $p2Winner = $match['winner_id'] && (int)$match['winner_id'] === (int)$match['player2_id'];
                                                ?>
                                                <div class="match-player <?= $p1Winner ? 'winner' : '' ?>">
                                                    <span><?= h($match['player1_name'] ?? 'BYE') ?></span>
                                                    <span><?= ($match['sets_p1'] !== null) ? (int)$match['sets_p1'] : '-' ?></span>
                                                </div>
                                                <div class="match-player <?= $p2Winner ? 'winner' : '' ?>">
                                                    <span><?= h($match['player2_name'] ?? 'BYE') ?></span>
                                                    <span><?= ($match['sets_p2'] !== null) ? (int)$match['sets_p2'] : '-' ?></span>
                                                </div>
                                            </article>
                                        <?php endforeach; ?>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    <?php endif; ?>
                </div>
            </details>
        </section>
    <?php endif; ?>
<?php endif; ?>

<?php if ($championship['status'] !== 'setup' && $matches): ?>
<section class="card" style="margin-top:16px;">
    <h3>Registro de partidas (sets e pontos)</h3>
    <details class="fold" open>
        <summary>Exibir partidas para lançamento de resultados</summary>
        <div class="fold-content">
            <?php foreach ($matches as $match): ?>
                <?php if (!$match['player1_id'] || !$match['player2_id']): ?>
                    <?php continue; ?>
                <?php endif; ?>

                <?php if ($isGroupStage && $hasGroupKnockout && $match['group_number'] !== null): ?>
                    <?php continue; ?>
                <?php endif; ?>

                <?php $savedSets = $match['set_details'] ? json_decode($match['set_details'], true) : []; ?>
                <?php
                $player1Label = $match['player1_name'] ?? 'Jogador 1';
                $player2Label = $match['player2_name'] ?? 'Jogador 2';

                if ($match['group_number'] !== null) {
                    $summaryTitle = 'Grupo ' . (int)$match['group_number'] . ' - Partida #' . (int)$match['match_number'];
                } else {
                    $labelTotalRounds = $isGroupStage ? $knockoutTotalRounds : $totalRounds;
                    $summaryTitle = roundLabel((int)$match['round_number'], (int)$labelTotalRounds) . ' - Partida #' . (int)$match['match_number'];
                }

                $summaryStatus = $match['status'] === 'completed'
                    ? ((int)$match['sets_p1'] . ' x ' . (int)$match['sets_p2'])
                    : 'Pendente';
                ?>

                <details class="match-entry" <?= $match['status'] === 'completed' ? '' : 'open' ?>>
                    <summary>
                        <?= h($summaryTitle) ?>
                        <span class="match-summary-status"><?= h($summaryStatus) ?></span>
                    </summary>
                    <div class="match-form-inner">
                        <form id="match-<?= (int)$match['id'] ?>" method="post" style="margin-bottom:0; border:0; border-radius:0; padding:0;">
                            <input type="hidden" name="action" value="save_result">
                            <input type="hidden" name="match_id" value="<?= (int)$match['id'] ?>">

                            <p style="margin:0 0 10px;"><strong><?= h($match['player1_name']) ?></strong> x <strong><?= h($match['player2_name']) ?></strong></p>

                            <div class="set-grid">
                                <?php for ($i = 1; $i <= 5; $i++): ?>
                                    <?php
                                    $existingP1 = $savedSets[$i - 1]['p1'] ?? '';
                                    $existingP2 = $savedSets[$i - 1]['p2'] ?? '';
                                    ?>
                                    <div>
                                        <label>Set <?= $i ?> (<?= h($player1Label) ?>)
                                            <input type="number" min="0" name="set_<?= $i ?>_p1" value="<?= h((string)$existingP1) ?>">
                                        </label>
                                        <label>Set <?= $i ?> (<?= h($player2Label) ?>)
                                            <input type="number" min="0" name="set_<?= $i ?>_p2" value="<?= h((string)$existingP2) ?>">
                                        </label>
                                    </div>
                                <?php endfor; ?>
                            </div>

                            <div class="result-summary" style="margin-top:10px;">
                                <?php if ($match['status'] === 'completed'): ?>
                                    Resultado atual: <?= (int)$match['sets_p1'] ?> x <?= (int)$match['sets_p2'] ?> |
                                    Pontos: <?= (int)$match['total_points_p1'] ?> x <?= (int)$match['total_points_p2'] ?>
                                    <?= $match['is_bye'] ? '(BYE)' : '' ?>
                                <?php else: ?>
                                    Partida pendente.
                                <?php endif; ?>
                            </div>

                            <button type="submit">Salvar resultado</button>
                        </form>
                    </div>
                </details>
            <?php endforeach; ?>
        </div>
    </details>
</section>
<?php endif; ?>

<?php if ($classification): ?>
<section class="card" style="margin-top:16px;">
    <h3>Resultado final</h3>
    <div class="final-box">
        <?php if ($isGroupStage): ?>
            <div><strong>1º lugar:</strong> <?= h($classification['champion']) ?></div>
            <div><strong>2º lugar:</strong> <?= h($classification['runner_up']) ?></div>
            <div>
                <strong>3º lugar:</strong>
                <?php if (!$classification['third_places']): ?>
                    -
                <?php else: ?>
                    <?= h(implode(' e ', $classification['third_places'])) ?>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <div><strong>Campeão:</strong> <?= h($classification['champion']) ?></div>
            <div><strong>Vice-campeão:</strong> <?= h($classification['runner_up']) ?></div>
            <div>
                <strong>Terceiros colocados:</strong>
                <?php if (!$classification['third_places']): ?>
                    -
                <?php else: ?>
                    <?= h(implode(' e ', $classification['third_places'])) ?>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    </div>
</section>
<?php endif; ?>

<?php require __DIR__ . '/includes/footer.php'; ?>
