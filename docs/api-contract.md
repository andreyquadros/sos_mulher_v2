# Contrato API V2

Base `/api`. JSON camelCase, UTC ISO8601. Todas respostas de erro `{error: string}`. IDs UUID. Agência é escopo isolado; usuários da mesma agência podem ser PM/PC/GM. Servidor determina agencyId; nunca confiar no cliente. Cookie de sessão HttpOnly SameSite=Strict para painel; Bearer exclusivo do dispositivo para mobile. Sem token em URL. Origem do painel via proxy de mesma origem. Demo local explícito com fixtures fictícias, nunca habilitar em produção.

## Operadores
- POST `/auth/login` `{email,password}` → `{operator:{id,name,email,agencyId,role}}` e cookie.
- GET `/auth/me` → `{operator}`; POST `/auth/logout`.
- GET `/me/onboarding` → `{completed:boolean,version:1}` para o operador autenticado. POST `/me/onboarding` `{version:1}` registra a conclusão ou dispensa do guia da central. Exige cookie e origem do painel; todos os perfis podem concluir apenas o próprio guia, sem ganhar permissões operacionais. A conclusão é idempotente e persiste entre sessões e dispositivos; não registra conteúdo de ocorrências.
- GET `/snapshot` → `{incidents: Incident[],women: Woman[],audit: AuditEvent[],serverTime}`.
- POST `/women` `{name,phone,reference,notes?}` → `{woman}`. Só operador admin/dispatcher, rate-limited. `reference` é identificador interno, não CPF obrigatório.
- POST `/women/:id/pairing` `{}` → `{code,expiresAt}` código de uso único válido 10 min. Só admin/dispatcher.
- POST `/incidents/:id/ack` `{}` → `{incident}` reconhecimento humano separado de atribuição.
- POST `/incidents/:id/claim` `{expectedRevision:number}` → `{incident}` (409 em conflito).
- POST `/incidents/:id/resolve` `{expectedRevision:number,resolution:string}` → `{incident}`; exige responsável/admin e justificativa.
- GET `/incidents/:id/locations` → `{locations: LocationPoint[]}`.
- GET `/incidents/:id/audio` → `{chunks: AudioChunk[]}` (metadados).
- GET `/audio/:id/content` → áudio privado autenticado, Cache-Control no-store e auditoria.
- GET `/events` SSE autenticado por cookie; evento `change` `{seq,kind,incidentId?}`. Heartbeat. Painel usa fetch streaming + reconexão/snapshot para recuperar desconexões. Não é prova de recebimento humano.

## Dispositivo
- POST `/devices/pair` `{code,consentVersion:'2026-10',consentLocation:true,consentAudio:boolean}` → `{deviceId,deviceToken,womanName}`. Não aceitar consentLocation false; consentAudio opcional.
- GET `/devices/me` Bearer → `{deviceId,womanName,consentAudio,activeIncident: Incident|null}`. Permite detectar encerramento.
- POST `/device/incidents` Bearer `{clientEventId:UUID,trigger:'hold'|'volume'|'notification'|'voice',simulated:boolean,createdAt:ISO8601}` → `{incident:Incident}`. `voice` identifica pedido confirmado pelo reconhecimento local; a frase e o áudio de treino não fazem parte do contrato. Idempotência por device+clientEventId; no máximo uma ocorrência aberta por dispositivo. Um novo evento real durante ocorrência simulada promove a mesma ocorrência atomicamente: mantém responsável, registra o tipo do acionamento real, limpa reconhecimento, atualiza recebimento/revisão e emite `incident.escalated`; o alias do novo UUID preserva idempotência. Um teste jamais reduz uma emergência real. Modo demo força simulado.
- POST `/device/incidents/:id/locations` Bearer `{sequence:number,latitude:number,longitude:number,accuracy:number,capturedAt:ISO8601,battery?:number}` → `{accepted:true}`. Idempotência por incident+sequence, não retroceder posição mais recente por envio fora de ordem. Validação de limites e timestamps; posições só da própria ocorrência aberta.
- POST `/device/incidents/:id/audio?sequence=N&capturedAt=ISO8601` Bearer, `Content-Type: audio/aac` ou `audio/mp4`, bytes ≤512KiB → `{accepted:true}`. Consentimento áudio exigido; idempotência incident+sequence. Blocos independentes AAC/M4A de 4s; central reproduz sequência sob ação humana. Não chamar de WebRTC/latência garantida.

## Modelos
Woman `{id,name,phone,reference,notes,agencyId,createdAt}`.
Incident `{id,code,womanId,womanName,status:'new'|'assigned'|'resolved',simulated:boolean,trigger,createdAt,receivedAt,acknowledgedAt:string|null,assignedTo:string|null,assignedName:string|null,resolvedAt:string|null,revision:number,lastLocation:LocationPoint|null,audioCount:number}`.
LocationPoint `{sequence,latitude,longitude,accuracy,capturedAt,receivedAt,battery?:number}`.
AudioChunk `{id,sequence,capturedAt,receivedAt,mimeType,url}` URL relativa privada.
AuditEvent `{id,action,actorName,incidentId:string|null,createdAt,detail}`.

## Atualização do banco existente

Esta versão registra `PRAGMA user_version=1`. Ao abrir um banco anterior (versão0), a API amplia o CHECK de `incidents.trigger` para aceitar `voice` usando a [sequência de alteração de tabela do SQLite](https://www.sqlite.org/lang_altertable.html#otheralter): cria a tabela nova, copia as colunas e IDs, substitui a anterior e restaura índices, views e triggers numa transação. `foreign_key_check` precisa passar antes do commit; o enforcement de chaves estrangeiras é reativado ao sair. Ocorrências, atribuições, aliases de idempotência, localização, áudio, auditoria e eventos SSE mantêm suas identidades. Uma falha reverte a migração. Reabrir a versão1 não repete a cópia; versão de banco mais recente é recusada. Faça backup consistente antes de atualizar um servidor próprio e interrompa a instância antiga durante a implantação.

O guia da central acrescenta a tabela `operator_onboarding` com operador, versão do guia e data de conclusão. A criação é aditiva e idempotente, sem reconstruir tabelas operacionais nem alterar pareamentos, permissões, ocorrências ou evidências.
