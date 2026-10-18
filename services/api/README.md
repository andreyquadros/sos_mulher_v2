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

O processo recusa `DEMO_MODE=true` em produção, recusa abrir banco de demonstração em modo institucional e recusa popular banco institucional existente com fixtures. Sessões e tokens de dispositivo são opacos e persistidos apenas por SHA-256; senhas usam scrypt com sal aleatório. A sessão dura oito horas e é invalidada ao sair. O SSE verifica novamente a sessão a cada evento/heartbeat e encerra imediatamente ao sair.

Os perfis `admin` e `dispatcher` podem cadastrar, parear, reconhecer e assumir atendimento. `observer` permite consulta. Encerramento exige responsável ou administrador, revisão atual e justificativa de pelo menos dez caracteres. Agência é sempre obtida da identidade autenticada. Novos operadores podem ser provisionados em manutenção controlada pelo método `Store.createOperator`, sem rota pública de criação de privilégios.

## Entrega e recuperação

- Pareamento: código numérico de oito dígitos, hash no banco, uso único e validade de dez minutos. Novo código invalida o anterior. Consumir um novo pareamento revoga o token do dispositivo anterior. A substituição é bloqueada durante ocorrência aberta.
- Acionamento: `clientEventId` idempotente por dispositivo, persistido inclusive após encerramento. Há apenas uma ocorrência aberta por dispositivo. Recebimento do servidor e reconhecimento humano são campos separados.
- Localização: números validados, precisão e bateria preservadas, sequência única por ocorrência. A posição atual usa `capturedAt`, depois sequência; pacotes atrasados não movem a assistida para uma posição mais antiga.
- Novas amostras precisam estar nas últimas 24 horas, com tolerância de cinco minutos no futuro e não anteriores ao início da ocorrência por mais de cinco minutos. Reenvios idênticos já persistidos são idempotentes. Sequência reutilizada com conteúdo diferente retorna `409`.
- Áudio: exige adesão específica. Recebe blocos AAC/M4A independentes com até 512 KiB. Dados ficam em BLOBs privados no banco, sem URL pública nem token em URL. Conteúdo exige cookie de operador da mesma agência, usa `Cache-Control: no-store` e gera auditoria de acesso. Não há transcodificação nem garantia de latência; o celular produz arquivos AAC/M4A reproduzíveis.
- Eventos: SSE `change` com `id`/`seq` persistido e heartbeat de 15 segundos. `Last-Event-ID` recupera até 500 mudanças; se ultrapassar esse limite, envia `kind: snapshot`. Cada abertura sem cursor também solicita snapshot. O cliente deve recarregar snapshot após reconexão e avisar quando perder conexão. Máximo de três streams por operador.
- Snapshot: todas as ocorrências abertas, até 200 encerradas recentes, cadastros da agência e 200 eventos recentes de auditoria. O histórico completo permanece no banco para políticas institucionais de retenção.

Há limites por IP, identidade e operação, além de limites de corpo. Os limites locais não substituem o gateway de produção. O serviço não confia em `X-Forwarded-For`; configure limites no proxy por IP original e limite acesso direto à API.

## Operação e testes

Os testes cobrem sessão/CSRF, expiração, perfis e agência, pareamento/revogação, concorrência por revisão, acionamento idempotente, localização fora de ordem, consentimento e privacidade do áudio, limites, persistência após reinício, bloqueios de demonstração, SSE/reconexão/logout. Não usam dados pessoais reais.

Antes de atendimento real, configure TLS no proxy, volumes e backups criptografados, política de retenção/remoção de áudio e dados, monitoramento de espaço e disponibilidade, contas institucionais individuais e ensaio ponta a ponta com aparelhos físicos e a central. SQLite não oferece criptografia em repouso neste projeto; ela cabe ao volume institucional. As rotas de emergência só comprovam persistência no servidor e reconhecimento registrado no painel; não comprovam despacho ou chegada de uma equipe.

Referências de implementação: [Fastify](https://fastify.dev/docs/latest/Reference/Server/), [SQLite nativo do Node](https://nodejs.org/api/sqlite.html).
