<?php

declare(strict_types=1);

require_once __DIR__ . '/includes/functions.php';

$message = null;
$messageType = 'success';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    try {
        if ($action === 'create') {
            $name = trim($_POST['name'] ?? '');
            $date = trim($_POST['championship_date'] ?? '');
            $organizationType = normalizeChampionshipFormat($_POST['organization_type'] ?? 'knockout');
            $preferredGroupSize = normalizeGroupSize((int)($_POST['preferred_group_size'] ?? 4));
            $groupQualifiersCount = normalizeGroupQualifiers((int)($_POST['group_qualifiers_count'] ?? 2));

            if ($name === '' || $date === '') {
                throw new RuntimeException('Nome e data são obrigatórios.');
            }

            db()->prepare(
                'INSERT INTO championships (name, championship_date, organization_type, preferred_group_size, group_qualifiers_count, status)
                 VALUES (:name, :championship_date, :organization_type, :preferred_group_size, :group_qualifiers_count, :status)'
            )->execute([
                'name' => $name,
                'championship_date' => $date,
                'organization_type' => $organizationType,
                'preferred_group_size' => $organizationType === 'groups' ? $preferredGroupSize : null,
                'group_qualifiers_count' => $organizationType === 'groups' ? $groupQualifiersCount : null,
                'status' => 'setup',
            ]);

            $message = 'Campeonato criado com sucesso.';
        }

        if ($action === 'update') {
            $id = (int)($_POST['id'] ?? 0);
            $name = trim($_POST['name'] ?? '');
            $date = trim($_POST['championship_date'] ?? '');
            $organizationType = normalizeChampionshipFormat($_POST['organization_type'] ?? 'knockout');
            $preferredGroupSize = normalizeGroupSize((int)($_POST['preferred_group_size'] ?? 4));
            $groupQualifiersCount = normalizeGroupQualifiers((int)($_POST['group_qualifiers_count'] ?? 2));

            if ($id <= 0 || $name === '' || $date === '') {
                throw new RuntimeException('Dados inválidos para atualização.');
            }

            $currentStmt = db()->prepare('SELECT status, organization_type, group_qualifiers_count FROM championships WHERE id = :id');
            $currentStmt->execute(['id' => $id]);
            $current = $currentStmt->fetch();

            if (!$current) {
                throw new RuntimeException('Campeonato não encontrado.');
            }

            if ($current['status'] !== 'setup' && $organizationType !== normalizeChampionshipFormat($current['organization_type'])) {
                throw new RuntimeException('Não é possível alterar o formato após confirmar a chave.');
            }

            if (
                $current['status'] !== 'setup'
                && $organizationType === 'groups'
                && $groupQualifiersCount !== normalizeGroupQualifiers((int)($current['group_qualifiers_count'] ?? 2))
            ) {
                throw new RuntimeException('Não é possível alterar o número de classificados por grupo após confirmar a chave.');
            }

            $previousFormat = normalizeChampionshipFormat($current['organization_type'] ?? 'knockout');

            db()->prepare(
                'UPDATE championships
                 SET name = :name,
                     championship_date = :championship_date,
                     organization_type = :organization_type,
                     preferred_group_size = :preferred_group_size,
                     group_qualifiers_count = :group_qualifiers_count
                 WHERE id = :id'
            )
                ->execute([
                    'name' => $name,
                    'championship_date' => $date,
                    'organization_type' => $organizationType,
                    'preferred_group_size' => $organizationType === 'groups' ? $preferredGroupSize : null,
                    'group_qualifiers_count' => $organizationType === 'groups' ? $groupQualifiersCount : null,
                    'id' => $id,
                ]);

            if ($current['status'] === 'setup' && $previousFormat !== $organizationType) {
                db()->prepare('DELETE FROM matches WHERE championship_id = :championship_id')
                    ->execute(['championship_id' => $id]);
            }

            $message = 'Campeonato atualizado com sucesso.';
        }

        if ($action === 'delete') {
            $id = (int)($_POST['id'] ?? 0);
            if ($id <= 0) {
                throw new RuntimeException('Campeonato inválido.');
            }

            db()->prepare('DELETE FROM championships WHERE id = :id')->execute(['id' => $id]);
            $message = 'Campeonato excluído com sucesso.';
        }
    } catch (Throwable $e) {
        $messageType = 'error';
        $message = $e->getMessage();
    }
}

$editChampionship = null;
if (isset($_GET['edit'])) {
    $id = (int)$_GET['edit'];
    $stmt = db()->prepare('SELECT * FROM championships WHERE id = :id');
    $stmt->execute(['id' => $id]);
    $editChampionship = $stmt->fetch() ?: null;
}

$championships = db()->query('SELECT * FROM championships ORDER BY championship_date DESC, id DESC')->fetchAll();
$statusCounters = [
    'setup' => 0,
    'confirmed' => 0,
    'finished' => 0,
];

foreach ($championships as $championship) {
    $status = (string)$championship['status'];
    if (isset($statusCounters[$status])) {
        $statusCounters[$status]++;
    }
}

$pageTitle = 'Campeonatos';
require __DIR__ . '/includes/header.php';
?>

<?php if ($message): ?>
    <div class="alert <?= h($messageType) ?>"><?= h($message) ?></div>
<?php endif; ?>

<section class="stats-grid">
    <article class="stat-box">
        <small>Total cadastrados</small>
        <strong><?= count($championships) ?></strong>
    </article>
    <article class="stat-box">
        <small>Em configuracao</small>
        <strong><?= $statusCounters['setup'] ?></strong>
    </article>
    <article class="stat-box">
        <small>Confirmados</small>
        <strong><?= $statusCounters['confirmed'] ?></strong>
    </article>
    <article class="stat-box">
        <small>Finalizados</small>
        <strong><?= $statusCounters['finished'] ?></strong>
    </article>
</section>

<section class="grid-two">
    <div class="card">
        <h2><?= $editChampionship ? 'Editar campeonato' : 'Criar campeonato' ?></h2>
        <form method="post">
            <input type="hidden" name="action" value="<?= $editChampionship ? 'update' : 'create' ?>">
            <?php if ($editChampionship): ?>
                <input type="hidden" name="id" value="<?= (int)$editChampionship['id'] ?>">
            <?php endif; ?>

            <label>Nome do campeonato
                <input type="text" name="name" required value="<?= h($editChampionship['name'] ?? '') ?>">
            </label>

            <label>Data
                <input type="date" name="championship_date" required value="<?= h($editChampionship['championship_date'] ?? '') ?>">
            </label>

            <label>Formato da disputa
                <select name="organization_type" required>
                    <?php $selectedFormat = normalizeChampionshipFormat($editChampionship['organization_type'] ?? 'knockout'); ?>
                    <option value="knockout" <?= $selectedFormat === 'knockout' ? 'selected' : '' ?>>Eliminatório</option>
                    <option value="groups" <?= $selectedFormat === 'groups' ? 'selected' : '' ?>>Fase de grupos</option>
                </select>
            </label>

            <label>Tamanho preferido dos grupos (quando usar fase de grupos)
                <input type="number" name="preferred_group_size" min="3" max="8"
                       value="<?= h((string)($editChampionship['preferred_group_size'] ?? 4)) ?>">
            </label>

            <label>Classificados por grupo para o mata-mata
                <input type="number" name="group_qualifiers_count" min="1" max="8"
                       value="<?= h((string)($editChampionship['group_qualifiers_count'] ?? 2)) ?>">
            </label>

            <button type="submit"><?= $editChampionship ? 'Salvar alterações' : 'Criar campeonato' ?></button>
            <?php if ($editChampionship): ?>
                <a class="button-link btn-secondary" href="campeonatos.php">Cancelar edição</a>
            <?php endif; ?>
        </form>
    </div>

    <div class="card">
        <h2>Campeonatos cadastrados</h2>
        <div class="table-wrap">
            <table>
                <thead>
                <tr>
                    <th>Nome</th>
                    <th>Data</th>
                    <th>Formato</th>
                    <th>Status</th>
                    <th>Ações</th>
                </tr>
                </thead>
                <tbody>
                <?php if (!$championships): ?>
                    <tr><td colspan="5">Nenhum campeonato cadastrado.</td></tr>
                <?php else: ?>
                    <?php foreach ($championships as $item): ?>
                        <tr>
                            <td><?= h($item['name']) ?></td>
                            <td><?= h($item['championship_date']) ?></td>
                            <td><?= h(championshipFormatLabel($item['organization_type'] ?? 'knockout')) ?></td>
                            <td><span class="badge <?= h($item['status']) ?>"><?= h(statusLabel($item['status'])) ?></span></td>
                            <td>
                                <div class="inline-actions">
                                    <a class="button-link" href="campeonato.php?id=<?= (int)$item['id'] ?>">Abrir</a>
                                    <a class="button-link" href="campeonatos.php?edit=<?= (int)$item['id'] ?>">Editar</a>
                                    <form method="post" style="display:inline;">
                                        <input type="hidden" name="action" value="delete">
                                        <input type="hidden" name="id" value="<?= (int)$item['id'] ?>">
                                        <button class="btn-danger" type="submit" data-confirm="Deseja excluir este campeonato?">Excluir</button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
