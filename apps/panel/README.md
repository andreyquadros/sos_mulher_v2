# Central SOS Mulher

Painel React/TypeScript com sessões por cookie e eventos autenticados. O layout aplica a identidade dos assets fornecidos: navy operacional, foco magenta, sinalizações douradas, Manrope e DM Sans locais. Os marcadores reutilizam o pacote de design; o símbolo e o favicon V2 derivam da nova arte gerada com essas referências. O mapa é geográfico e interativo, não uma imagem do conceito.

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

## Provedor de mapas

`VITE_MAP_TILE_URL` configura um endpoint XYZ com tiles de 256 px (`{z}`, `{x}`, `{y}`; `{s}` opcional) e `VITE_MAP_ATTRIBUTION` contém a atribuição do provedor. As duas variáveis são públicas e entram no **build** do Vite. Não use senhas, credenciais privadas ou chaves secretas; a atribuição aceita HTML de configuração confiável. Um provedor personalizado exige atribuição própria. Configurações inválidas são recusadas no início do Vite e no build. HTTP só é permitido para tiles em loopback no desenvolvimento.

Sem configuração, a demonstração usa os tiles públicos do OpenStreetMap e mantém sua atribuição. **Na produção, preferir tiles institucionais ou um provedor contratado e homologado**, dimensionado para a operação. Cada navegação do mapa solicita os tiles da área e do nível de zoom visíveis: o provedor recebe o IP da central e pode inferir seu viewport e as áreas acompanhadas. Nomes, tokens de sessão, identificadores de ocorrência e trilhas não são acrescentados às URLs de tiles. O painel ainda precisa de conexão para carregar a cartografia; uma falha não apaga as coordenadas recebidas.

Exemplo de `.env.local` para desenvolvimento ou de variáveis do processo de build:

```dotenv
VITE_MAP_TILE_URL=https://mapas.exemplo.gov.br/tiles/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=Cartografia institucional
```

Na imagem Docker, essas variáveis precisam ser fornecidas como argumentos do build do painel, antes de `npm run build`; alterá-las apenas no ambiente do Nginx em execução não muda os arquivos já gerados.

## Identidade e movimento

A marca V2 gerada está em `public/brand/symbol-v2.png`; o favicon e as versões otimizadas preservam os originais em `design/generated/v2/`. O wordmark continua tipográfico. A galeria técnica [motion-preview.html](public/motion-preview.html) abre em `/motion-preview.html` no Vite ou no build publicado, sem entrada no menu de produção. Inclui os dois novos símbolos e quatro prévias interativas; não acessa a API e não ativa som, microfone ou localização.

O componente `MotionSignal` e o CSS/SVG leve de `public/motion/motion.css` distinguem:

- Novo alerta: anel suave, limitado a três ciclos de 1,92 segundo. A central só anima depois de observar um novo alerta ou a promoção de simulado para real; carregar uma fila existente não simula novo recebimento.
- Reconexão: órbita dourada enquanto a conexão está sendo recuperada. A última informação conhecida permanece acessível.
- Confirmação: traço único de 500 ms no aviso de ação concluída; o texto identifica qual ação foi confirmada. A animação não equivale a reconhecimento humano nem a despacho.
- Pressão de 3 segundos: somente a galeria demonstra o gesto com cancelamento ao soltar. Essa prévia não envia alertas e não adiciona efeitos ao disparo do aplicativo móvel.

`prefers-reduced-motion` mantém símbolos estáticos e textos de estado. A galeria também oferece um seletor de prévia estática. Não há flashes, dependência de GIF para estado operacional, nem novas animações ou sons de acionamento no celular.
