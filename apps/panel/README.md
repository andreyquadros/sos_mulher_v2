# Central SOS Mulher

Painel React/TypeScript com sessões por cookie e eventos autenticados. O layout aplica a identidade dos assets fornecidos: navy operacional, foco magenta, sinalizações douradas, Manrope e DM Sans locais. Marcadores, símbolo e favicon foram copiados do pacote de design; o mapa é geográfico e interativo, não uma imagem do conceito.

## Executar

```sh
npm ci
npm run dev
```

A API deve estar em `http://127.0.0.1:3001`. O Vite encaminha `/api` na mesma origem. Configure `PANEL_ORIGIN` no servidor para a origem exata do painel (`http://127.0.0.1:5173` no desenvolvimento). Use `VITE_DEMO_MODE=true npm run dev` somente com o servidor demo para exibir as credenciais fictícias e a identificação permanente de demonstração. Sem a flag, o painel não apresenta credenciais.

```sh
npm test
npm run build
```

O build gera `dist/` com fontes locais. Na instalação institucional, sirva o build e `/api` na mesma origem com TLS. Não publique variáveis privadas com prefixo `VITE_`.

## Comportamentos implementados

- Cookie HttpOnly mantido pelo servidor; nenhuma credencial ou token de sessão fica em localStorage. Login, sessão existente, expiração e logout.
- SSE via fetch com cookie, parser incremental, heartbeat, reconexão progressiva até 15 s e recuperação por snapshot; sincronização auxiliar a cada 30 s. Estado de conexão não representa reconhecimento humano.
- Fila prioriza alertas sem reconhecimento. Reconhecer e assumir são ações distintas. Atribuição e encerramento usam revisão esperada; conflito 409 atualiza o snapshot. Consulta não apresenta botões de alteração.
- Leaflet e OpenStreetMap com atribuição, seleção de ocorrência, enquadramento, trilha ordenada, círculo de precisão, coordenadas e posição antiga após 60 s. Tiles públicos exigem rede; falha de mapa base é indicada e as coordenadas continuam disponíveis. A troca de ocorrência descarta a trilha anterior.
- Som exige ativação e permite teste. Alerta não reconhecido se repete a cada 12 s, inclusive simulado (tom distinto). Notificações de sistema exigem permissão explícita e não incluem nome nem localização. Preferências só duram a sessão atual.
- Áudio autenticado é iniciado pelo operador, busca blobs privados e reproduz blocos por sequência. Indica ausência, falhas e lacunas; o operador pode prosseguir explicitamente do próximo bloco, mantendo a indicação das sequências não ouvidas. Não promete transmissão ao vivo nem latência garantida. Parar, trocar de ocorrência ou sair libera áudio e URLs temporárias.
- Cadastro restrito por perfil, geração de código de vínculo temporário, indicação de expiração e cópia explícita. A geração do código não afirma que o dispositivo já foi vinculado. Auditoria é lida do servidor.

## Validação

Os testes cobrem fragmentação e CRLF no SSE, credenciais e cache nas requisições, rejeição de URLs de áudio externas, conflito de revisão, preservação de revisões contra snapshots atrasados e a métrica da ocorrência mais antiga após reconhecimento humano.

O fluxo real com dispositivo, segundo plano, rede móvel e áudio depende da homologação do app Android e da infraestrutura institucional. A central não cria dados fictícios por conta própria; exibe somente o que recebe da API.
