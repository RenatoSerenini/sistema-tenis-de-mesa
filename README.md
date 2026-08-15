# Sistema de Tênis de Mesa

Sistema web para gerenciamento de campeonatos de tênis de mesa.

## Sobre o projeto

Este é um sistema web desenvolvido para auxiliar no gerenciamento de campeonatos de tênis de mesa. O sistema permite:
- Cadastro e gerenciamento de jogadores
- Criação e gerenciamento de campeonatos
- Organização de confrontos e chaves
- Registro de resultados e pontuação
- Visualização de classificação e estatísticas

## Funcionalidades

- **Jogadores**: CRUD completo de jogadores com cadastro, edição e listagem
- **Campeonatos**: Criação de campeonatos com formato eliminatório ou por grupos
- **Chaveamento**: Geração automática de confrontos com suporte a BYE e reorganização manual
- **Partidas**: Registro de resultados por sets, cálculo automático de vencedores
- **Classificação**: Acompanhamento de pontuação e avanço automático nas fases
- **Visualização**: Gráficos de bracket e tabelas de classificação

## Tecnologias

- HTML5, CSS3, JavaScript (Vanilla)
- PHP (server-side)
- MySQL (banco de dados)

## Estrutura do projeto

- `database.sql`: Script para criação do banco de dados
- `index.php`: Página inicial do sistema
- `jogadores.php`: Gerenciamento de jogadores
- `campeonatos.php`: Gerenciamento de campeonatos
- `campeonato.php`: Gestão completa da chave e partidas
- `includes/`: Arquivos de inclusão (db.php, header.php, footer.php, functions.php)
- `assets/`: Arquivos estáticos (CSS, JavaScript)

## Como executar

1. Instale o PHP e MySQL no seu computador
2. Crie o banco de dados executando `database.sql` no MySQL
3. Edite `includes/db.php` com suas credenciais do banco
4. Execute o servidor PHP: `php -S localhost:8000`
5. Acesse o sistema em `http://localhost:8000/index.php`

## Status

Projeto em desenvolvimento ativo. Funcionalidades principais implementadas e testadas.

## Licença

Este projeto está sob licença MIT.
