# Próxima etapa

Nada aqui está implementado. É o mapa do que a arquitetura já está pronta
para receber.

## 1. Armazenamento local

O único trabalho é escrever um adaptador. A interface está em
`services/storage/tipos.ts` e o guia em `services/storage/LEIA-ME.md`.

**IndexedDB** é o caminho mais direto: nativo do navegador, sem dependência,
alguns megabytes de espaço, assíncrono (que é o que a interface já espera).

**SQLite via WASM** vale se você quiser consultas SQL e um arquivo `.db`
exportável. Custa ~1 MB de download e exige persistir o arquivo — vale
considerar granularidade fina no adaptador (`inserir`/`atualizar`/`remover`
por registro) em vez de substituir a coleção inteira.

Ordem sugerida: IndexedDB primeiro. Ele já resolve persistência e backup, e a
troca por SQLite depois continua sendo uma linha.

## 2. Backup e restauração

Com a porta de armazenamento pronta, backup é percorrer as coleções e gerar
um JSON. Restauração é o caminho inverso. Sugestões:

- Exportar tudo em um arquivo com data no nome
- Avisar quando o último backup passou de X dias
- Confirmar antes de restaurar, porque a operação sobrescreve

## 3. Vendas

A entidade não existe ainda. Precisará de: item vendido (produto ou serviço),
quantidade, desconto, forma de pagamento e vínculo opcional com atendimento.
Ao fechar a venda, o fluxo já tem onde se apoiar:

- Baixa de estoque → `produtosRepo.movimentar` (já valida saldo)
- Receita → `lancamentosRepo` (mesmo caminho de `atendimento.ts`)
- Pontos → `pontosRepo`

## 4. Estoque

O básico está pronto. Falta:
- Vincular produtos a serviços, para baixa automática ao concluir
- Cadastro de fornecedores na interface (o repositório já existe)
- Histórico de movimentações visível na tela

## 5. Financeiro

Falta: contas recorrentes, fechamento de caixa por dia, comissão por
profissional.

## 6. Autenticação de verdade

Só faz sentido com backend. Quando houver, `services/sessao.ts` é o único
arquivo a substituir — nenhuma tela muda, porque todas conversam com o
contexto de sessão.

Enquanto o sistema roda em um aparelho só dentro do studio, a escolha de
perfil dá conta.
