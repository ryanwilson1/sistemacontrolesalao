# Decisões e o porquê

Registro do que foi escolhido e do que foi descartado, para que a próxima
pessoa (ou você daqui a seis meses) não refaça a discussão.

---

**Porta e adaptador para o armazenamento, em vez de acesso direto.**
Sem isso, migrar para IndexedDB significaria abrir todos os repositórios,
hooks e telas. Com a porta, é uma linha. O custo é uma camada a mais de
indireção — barato perto do que evita.

**Métodos assíncronos mesmo com armazenamento em memória.**
Memória é síncrona; IndexedDB e SQLite não são. Assinar como `Promise` agora
custa alguns `await` a mais e economiza a reescrita completa depois.

**Regras de negócio nos serviços, nunca nos componentes.**
O anti-conflito de horário vale para o painel e para o link público. Se
morasse dentro do formulário, precisaria ser duplicado — e duplicata é onde a
divergência nasce.

**`RepositorioBase<T>` genérico.**
Oito repositórios repetiriam o mesmo "buscar, alterar, gravar". Uma classe
base resolve o CRUD; cada repositório fica só com o que é dele.

**React Query fora.**
Sem rede, restava guardar resultado e invalidar. 40 linhas próprias contra
40 KB de biblioteca. `useConsulta` mantém a mesma forma de `useQuery` para a
volta ser fácil se houver servidor.

**React Hook Form e Zod fora.**
Os formulários são diretos e as validações que importam vivem nos serviços,
onde também protegem o link público. Se um formulário crescer muito, vale
reconsiderar — `useFormulario` tem assinatura parecida de propósito.

**Dados de demonstração voláteis.**
Sem eles, todas as telas abririam vazias e não daria para avaliar nada. Ficam
em `services/seed.ts`, isolados: quando o IndexedDB entrar, o arquivo pode ser
apagado sem afetar mais nada.

**Escolha de perfil em vez de senha.**
Guardar hash de senha no navegador não protege de ninguém — quem abre o
DevTools contorna. Uma senha ali daria uma sensação de segurança que não
existe. Melhor ser explícito: identificação, não autenticação.

**Gráfico do painel sob demanda.**
Recharts pesa ~110 KB comprimidos e só a gestão vê o gráfico. Carregar na
primeira tela penalizaria todo mundo.

**Exclusão lógica em clientes e serviços.**
Apagar de verdade quebraria o histórico de atendimentos. `ativo: false`
esconde sem destruir.

**Saldo de estoque derivado das movimentações.**
Um número editável direto perde a história. Toda mudança passa por
`movimentar`, que registra o motivo e valida o saldo.
