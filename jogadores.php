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
            $category = trim($_POST['category'] ?? '');

            if ($name === '' || $category === '') {
                throw new RuntimeException('Nome e categoria são obrigatórios.');
            }

            $stmt = db()->prepare('INSERT INTO players (name, category) VALUES (:name, :category)');
            $stmt->execute(['name' => $name, 'category' => $category]);
            $message = 'Jogador cadastrado com sucesso.';
        }

        if ($action === 'update') {
            $id = (int)($_POST['id'] ?? 0);
            $name = trim($_POST['name'] ?? '');
            $category = trim($_POST['category'] ?? '');

            if ($id <= 0 || $name === '' || $category === '') {
                throw new RuntimeException('Dados inválidos para atualização.');
            }

            $stmt = db()->prepare('UPDATE players SET name = :name, category = :category WHERE id = :id');
            $stmt->execute(['name' => $name, 'category' => $category, 'id' => $id]);
            $message = 'Jogador atualizado com sucesso.';
        }

        if ($action === 'delete') {
            $id = (int)($_POST['id'] ?? 0);
            if ($id <= 0) {
                throw new RuntimeException('Jogador inválido.');
            }

            $stmt = db()->prepare('DELETE FROM players WHERE id = :id');
            $stmt->execute(['id' => $id]);
            $message = 'Jogador excluído com sucesso.';
        }
    } catch (Throwable $e) {
        $messageType = 'error';
        $message = $e->getMessage();
    }
}

$editPlayer = null;
if (isset($_GET['edit'])) {
    $id = (int)$_GET['edit'];
    $stmt = db()->prepare('SELECT * FROM players WHERE id = :id');
    $stmt->execute(['id' => $id]);
    $editPlayer = $stmt->fetch() ?: null;
}

$players = db()->query('SELECT * FROM players ORDER BY name')->fetchAll();

$pageTitle = 'Jogadores';
require __DIR__ . '/includes/header.php';
?>

<?php if ($message): ?>
    <div class="alert <?= h($messageType) ?>"><?= h($message) ?></div>
<?php endif; ?>

<section class="grid-two">
    <div class="card">
        <h2><?= $editPlayer ? 'Editar jogador' : 'Cadastrar jogador' ?></h2>
        <form method="post">
            <input type="hidden" name="action" value="<?= $editPlayer ? 'update' : 'create' ?>">
            <?php if ($editPlayer): ?>
                <input type="hidden" name="id" value="<?= (int)$editPlayer['id'] ?>">
            <?php endif; ?>

            <label>Nome
                <input type="text" name="name" required value="<?= h($editPlayer['name'] ?? '') ?>">
            </label>

            <label>Categoria
                <input type="text" name="category" required placeholder="Ex.: Sub-18, Adulto, Veterano"
                       value="<?= h($editPlayer['category'] ?? '') ?>">
            </label>

            <button type="submit"><?= $editPlayer ? 'Salvar alterações' : 'Cadastrar' ?></button>
            <?php if ($editPlayer): ?>
                <a class="button-link btn-secondary" href="jogadores.php">Cancelar edição</a>
            <?php endif; ?>
        </form>
    </div>

    <div class="card">
        <h2>Jogadores cadastrados</h2>
        <div class="table-wrap">
            <table>
                <thead>
                <tr>
                    <th>Nome</th>
                    <th>Categoria</th>
                    <th>Ações</th>
                </tr>
                </thead>
                <tbody>
                <?php if (!$players): ?>
                    <tr><td colspan="3">Nenhum jogador cadastrado.</td></tr>
                <?php else: ?>
                    <?php foreach ($players as $player): ?>
                        <tr>
                            <td><?= h($player['name']) ?></td>
                            <td><?= h($player['category']) ?></td>
                            <td>
                                <div class="inline-actions">
                                    <a class="button-link" href="jogadores.php?edit=<?= (int)$player['id'] ?>">Editar</a>
                                    <form method="post" style="display:inline;">
                                        <input type="hidden" name="action" value="delete">
                                        <input type="hidden" name="id" value="<?= (int)$player['id'] ?>">
                                        <button class="btn-danger" type="submit" data-confirm="Deseja excluir este jogador?">Excluir</button>
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
