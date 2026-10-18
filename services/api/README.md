# API Mulher Lume

API funcional do contrato [`docs/api-contract.md`](../../docs/api-contract.md), em Fastify + TypeScript e SQLite nativo. Requer **Node ≥22.13** (Node 24 LTS recomendado para o ambiente de implantação). Uma instância da API acessa um banco local; o diretório de dados deve estar em disco persistente, com acesso restrito ao serviço.

## Execução local

```sh
npm ci
DEMO_MODE=true npm run dev
```

Escuta `127.0.0.1:3001`. O painel usa proxy de mesma origem para `/api`; `PANEL_ORIGIN` deve corresponder exatamente à origem do painel, por padrão `http://127.0.0.1:5173`. As mutações de operador, incluindo login e logout, exigem esse cabeçalho `Origin`. Não há CORS permissivo.

A conta **somente para demonstração** é `demo@mulher.ro.gov.br` / `Lume-Demo-2026!`. Há três pessoas e ocorrências fictícias, com posições de simulação em Ariquemes. Nenhum áudio é pré-carregado. Em `DEMO_MODE=true` todas as novas ocorrências são marcadas como simuladas pelo servidor, independentemente do cliente.

```sh
npm run build
npm start
npm test
```

`createApp(options)` em `src/app.ts` permite testes sem porta com `app.inject()`. A suíte usa bancos temporários e também verifica o streaming SSE sobre uma conexão HTTP local.

## Configuração institucional

Use `.env.example` como referência. O servidor não carrega `.env` automaticamente: injete variáveis pelo gerenciador de processos ou por `node --env-file=... dist/server.js`.

| Variável | Uso |
| --- | --- |
| `NODE_ENV=production` | Obriga HTTPS na origem, cookie `Secure` e demonstração desativada. |
| `DEMO_MODE=false` | Nunca usar banco previamente marcado como demonstração. |
| `DATABASE_PATH` | Arquivo SQLite; padrão `./data/mulher-lume.sqlite`. |
| `PANEL_ORIGIN` | Origem exata do painel, sem caminho/barra final. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `AGENCY_ID` | Provisionam o primeiro administrador em banco vazio. Senha de 14–256 caracteres. Não sobrescrevem conta existente. |
| `HOST`, `PORT` | Padrão `127.0.0.1:3001`; somente o proxy deve expor o serviço publicamente. |
| `TRUST_PROXY_HOPS` | Inteiro de 0 a 2; padrão 0 ignora os cabeçalhos de encaminhamento. Ative somente para uma cadeia fixa de proxies controlados e acesso direto à API bloqueado. |

O processo recusa `DEMO_MODE=true` em produção, recusa abrir banco de demonstração em modo institucional e recusa popular banco institucional existente com fixtures. Sessões e tokens de dispositivo são opacos e persistidos apenas por SHA-256; senhas usam scrypt com sal aleatório. A sessão dura oito horas e é invalidada ao sair. O SSE verifica novamente a sessão a cada evento/heartbeat e encerra imediatamente ao sair.

Os perfis `admin` e `dispatcher` podem cadastrar, parear, reconhecer e assumir atendimento. `observer` permite consulta. Encerramento exige responsável ou administrador, revisão atual e justificativa de pelo menos dez caracteres. Agência é sempre obtida da identidade autenticada.

### Contas individuais da central

Após inicializar o primeiro administrador, provisione contas individuais para PC, PM e Guarda em manutenção local autorizada:

```sh
npm run operator:add
# Alternativa após build, sem dependências de desenvolvimento:
node dist/operator.js
```

O gerenciador de segredos/processos precisa injetar `DATABASE_PATH`, a configuração institucional da API e as variáveis abaixo. Não passe senhas como argumentos de linha de comando, não grave credenciais no repositório e não use conta compartilhada de demonstração em operação.

| Variável | Conteúdo |
| --- | --- |
| `OPERATOR_EMAIL` | E-mail individual e único. |
| `OPERATOR_NAME` | Nome de exibição, 2–120 caracteres. |
| `OPERATOR_ROLE` | `admin`, `dispatcher` ou `observer`. |
| `OPERATOR_AGENCY_ID` | Escopo de acesso; se ausente, usa `AGENCY_ID`. Use o mesmo identificador da central para equipes PC/PM/Guarda que atendem juntas. Identificadores diferentes isolam todos os dados. |
| `OPERATOR_PASSWORD` | Senha individual de 14–256 caracteres, injetada pelo gerenciador de segredos. |

O comando usa scrypt, registra auditoria e não imprime identidade ou senha. Recusa banco inexistente/vazio, banco de demonstração, perfil inválido e e-mail já existente. Não cria o primeiro administrador, não altera senhas e não sobrescreve contas. Não há rota HTTP pública para criação de privilégios. Retorna código de saída 0 em sucesso e 1 em erro.

## Entrega e recuperação

- Pareamento: código numérico de oito dígitos, hash no banco, uso único e validade de dez minutos. Novo código invalida o anterior. Consumir um novo pareamento revoga o token do dispositivo anterior. A substituição é bloqueada durante ocorrência aberta.
- Acionamento: `clientEventId` idempotente por dispositivo, persistido inclusive após encerramento. Há apenas uma ocorrência aberta por dispositivo. Recebimento do servidor e reconhecimento humano são campos separados.
- Emergência durante teste: um novo `clientEventId` com `simulated=false` promove atomicamente a ocorrência simulada aberta para real, preserva a atribuição, atualiza `receivedAt`, limpa `acknowledgedAt` e incrementa a revisão. Emite auditoria/evento `incident.escalated`, exigindo novo reconhecimento humano. Reenvios do mesmo evento não promovem novamente; teste nunca rebaixa uma ocorrência real. A trava de demonstração continua forçando `simulated=true`.
- Localização: números validados, precisão e bateria preservadas, sequência única por ocorrência. A posição atual usa `capturedAt`, depois sequência; pacotes atrasados não movem a assistida para uma posição mais antiga.
- Novas amostras precisam estar nas últimas 24 horas, com tolerância de cinco minutos no futuro e não anteriores ao início da ocorrência por mais de cinco minutos. Reenvios idênticos já persistidos são idempotentes. Sequência reutilizada com conteúdo diferente retorna `409`.
- Áudio: exige adesão específica. Recebe blocos AAC/M4A independentes com até 512 KiB. Dados ficam em BLOBs privados no banco, sem URL pública nem token em URL. Conteúdo exige cookie de operador da mesma agência, usa `Cache-Control: no-store` e gera auditoria de acesso. Não há transcodificação nem garantia de latência; o celular produz arquivos AAC/M4A reproduzíveis.
- Eventos: SSE `change` com `id`/`seq` persistido e heartbeat de 15 segundos. `Last-Event-ID` recupera até 500 mudanças; se ultrapassar esse limite, envia `kind: snapshot`. Cada abertura sem cursor também solicita snapshot. O cliente deve recarregar snapshot após reconexão e avisar quando perder conexão. Máximo de três streams por operador.
- Snapshot: todas as ocorrências abertas, até 200 encerradas recentes, cadastros da agência e 200 eventos recentes de auditoria. O histórico completo permanece no banco para políticas institucionais de retenção.

Há limites por identidade e operação, além de limites de corpo. O limite geral de 600 solicitações/minuto usa o ID de dispositivo ou operador **depois de validar** Bearer/cookie no banco. Sessões do mesmo operador compartilham um limite; aparelhos e operadores diferentes têm limites próprios mesmo quando chegam pelo mesmo Nginx. Solicitações anônimas ou com token inventado/revogado usam o IP determinado pela política abaixo. Limites específicos de login e pareamento continuam ativos. Os limites locais não substituem o gateway de produção.

Por padrão `TRUST_PROXY_HOPS=0`: o IP é o da conexão TCP, e `X-Forwarded-For` é ignorado. Em implantação com **cliente → proxy TLS → Nginx privado → API privada**, configure `TRUST_PROXY_HOPS=2`, sem publicar a porta da API e sem permitir acesso público direto ao Nginx interno. O proxy TLS de borda precisa **sobrescrever** `X-Forwarded-For` com seu `remote_addr`, descartando qualquer valor recebido do cliente. O Nginx interno deve acrescentar o endereço do proxy TLS com `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Com isso, a API seleciona o endereço exatamente dois saltos antes da conexão, sem confiar em endereços extras inseridos à esquerda da cadeia. Não confunda o cabeçalho `Forwarded` com essa política: ele não substitui `X-Forwarded-For`.

A implementação usa uma função explícita de confiança porque Fastify 5.12 não habilita confiança por parâmetro numérico. Essa função exige também que o peer TCP imediato esteja em loopback, rede privada RFC1918 ou IPv6 ULA; se a API receber uma conexão diretamente de IP público, ignora todos os valores de encaminhamento. Essa proteção adicional não substitui o isolamento da rede Docker nem a cadeia fixa de proxies.

Use `TRUST_PROXY_HOPS=1` apenas na topologia fixa **cliente → proxy controlado → API privada**, em que esse único proxy também sobrescreve o cabeçalho com o IP real do cliente. Não use `1`/`2` com rotas de comprimentos diferentes ou proxies acessíveis diretamente: confiar por distância pressupõe que todos os saltos configurados pertencem à infraestrutura institucional. A escolha correta também preserva limites de login/pareamento por cliente, em vez de somar todos os aparelhos no IP do proxy.

## Operação e testes

Os testes cobrem sessão/CSRF, expiração, perfis e agência, pareamento/revogação, concorrência por revisão, acionamento idempotente, localização fora de ordem, consentimento e privacidade do áudio, limites, persistência após reinício, bloqueios de demonstração, SSE/reconexão/logout. Não usam dados pessoais reais.

Antes de atendimento real, configure TLS no proxy, volumes e backups criptografados, política de retenção/remoção de áudio e dados, monitoramento de espaço e disponibilidade, contas institucionais individuais e ensaio ponta a ponta com aparelhos físicos e a central. SQLite não oferece criptografia em repouso neste projeto; ela cabe ao volume institucional. As rotas de emergência só comprovam persistência no servidor e reconhecimento registrado no painel; não comprovam despacho ou chegada de uma equipe.

Referências de implementação: [Fastify](https://fastify.dev/docs/latest/Reference/Server/), [SQLite nativo do Node](https://nodejs.org/api/sqlite.html).
