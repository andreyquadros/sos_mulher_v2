# Implantação institucional

A demonstração local usa somente dados fictícios. Não conectar assistidas reais até que servidor, operação de plantão e aparelhos tenham sido homologados em conjunto.

## Servidor e painel

O pacote inclui Dockerfiles e `compose.yaml` para uma instância de API e um painel Nginx com proxy de mesma origem. Requer Docker Engine e Compose v2 no servidor. O servidor deve ter volume persistente criptografado, backup restaurável e relógio sincronizado.

1. Copie `.env.example` para `.env` fora do Git; defina domínio HTTPS em `PANEL_ORIGIN`, agência operacional, nome/e-mail e senha inicial forte de pelo menos 14 caracteres. O arquivo não é enviado ao repositório. Mantenha permissões de leitura restritas.
2. Em uma máquina de implantação, execute `docker compose --env-file .env up -d --build --wait`. As verificações de saúde cobrem a API e o caminho pelo Nginx.
3. O painel escuta somente em `127.0.0.1` na porta `PANEL_BIND_PORT`, por padrão `8080`. Use uma origem HTTPS dedicada. Preserve o cabeçalho `Origin` e encaminhe `/api/events` sem buffering ou cache, com timeout acima de 30s. A API é acessível somente pelo painel. Este Compose usa `TRUST_PROXY_HOPS=2` para a cadeia proxy TLS → Nginx privado → API privada. O proxy TLS deve sobrescrever `X-Forwarded-For` com o IP do cliente. O Nginx interno acrescenta o endereço do proxy TLS. Para outra topologia, ajuste a contagem de saltos e repita os testes de IP e limite de requisições. Fora deste Compose, o padrão é zero.
4. Valide login, logout, reconexão SSE, reprodução de áudio, cadastro e acionamento em HTTPS. Defina limites por IP no gateway e mantenha os logs de requisição da Central desativados também no proxy TLS para não registrar identificadores nem parâmetros de ocorrências.
5. Cadastre contas individuais para PM, PC e Guarda, com `agencyId` compartilhado somente quando a cooperação e o acesso estiverem definidos. O bootstrap cria apenas o primeiro administrador; provisionamento adicional usa o CLI `node dist/operator.js` na imagem da API, com as variáveis OPERATOR_EMAIL, OPERATOR_NAME, OPERATOR_ROLE (admin/dispatcher/observer), OPERATOR_AGENCY_ID e OPERATOR_PASSWORD injetadas pelo gerenciador de segredos. Ele exige banco institucional inicializado, recusa demo e contas duplicadas, e não imprime credenciais. Não existe cadastro público de operadores. A interface não oferece gerenciamento completo de identidades/MFA.

`ADMIN_PASSWORD` só provisiona um banco vazio, não altera uma conta existente. Nunca reutilizar a conta demo em produção. O processo recusa demonstração em produção e recusa banco já populado como demo. A senha de bootstrap fica no ambiente do container; use gerenciamento de segredos da instituição e remova-a da configuração após a criação, preservando a forma de iniciar o banco existente.

O banco é montado em `/data/mulher-lume.sqlite`. Não use várias réplicas com esse arquivo. Faça backups consistentes pela API de backup SQLite ou pare a API para copiar banco, WAL e SHM como conjunto. Teste restauração em ambiente isolado. Não anexar backups a issues, Git ou logs.

Monitorar `/api/health`, espaço em disco, falhas de gravação, disponibilidade do stream e a sessão de plantão. Um endpoint saudável não garante operador atento. Áudio cresce continuamente durante ocorrência; definir prazo de guarda, procedimento de exportação autorizada, descarte e alarmes de armazenamento antes da operação. A aplicação não executa descarte automático arbitrário de evidências.

## Piloto em servidor compartilhado

Use um projeto Compose e um banco novos para o piloto. O exemplo usa `sos-mulher-piloto` com porta local `18080`. Confira a disponibilidade da porta no host. Em uma cópia separada do repositório, crie `.env.piloto` a partir de `.env.example`, com permissão `600`, `PANEL_BIND_PORT=18080`, `AGENCY_ID=piloto`, uma conta exclusiva e senha aleatória. Em `PANEL_ORIGIN`, informe a origem HTTPS reservada para o piloto, sem caminho ou barra final. A origem pode estar com DNS pendente nesta etapa.

```sh
docker compose -p sos-mulher-piloto --env-file .env.piloto config --quiet
docker compose -p sos-mulher-piloto --env-file .env.piloto up -d --build --wait
```

No computador do operador, abra o túnel e verifique a resposta do painel e da API antes de configurar DNS e TLS.

```sh
ssh -N -L 127.0.0.1:18080:127.0.0.1:18080 usuario@servidor
```

Em outro terminal, execute `curl -fsS http://127.0.0.1:18080/api/health`. O resultado esperado é `status: ok` e `demoMode: false`. Esse endereço local serve para verificar a instalação. A validação do login no navegador e o vínculo do APK usam a origem HTTPS configurada após a publicação pelo proxy.

Se o servidor já usa Traefik com Dokploy, a [configuração opcional](../deploy/compose.traefik.yaml) conecta somente o painel à rede externa. Antes de ativar, confira que o DNS aponta para o servidor, que as entradas `web` e `websecure` estão ativas e que o Traefik não confia em cabeçalhos de IP enviados diretamente pelo cliente. Defina `PANEL_HOST` como o hostname de `PANEL_ORIGIN`. Os nomes da rede, do resolvedor ACME e do middleware de redirecionamento podem ser ajustados com `TRAEFIK_NETWORK`, `TRAEFIK_CERT_RESOLVER` e `TRAEFIK_HTTPS_REDIRECT`.

```sh
docker compose -p sos-mulher-piloto --env-file .env.piloto -f compose.yaml -f deploy/compose.traefik.yaml config --quiet
docker compose -p sos-mulher-piloto --env-file .env.piloto -f compose.yaml -f deploy/compose.traefik.yaml up -d --no-deps --wait panel
```

Confirme o redirecionamento de HTTP e consulte `/api/health` no HTTPS sem desativar a validação do certificado. Verifique login e eventos pelo endereço público com dados fictícios. Para retirar a rota e manter o piloto privado, recrie o painel usando apenas o Compose principal.

Cadastre somente pessoas fictícias e use dispositivos de teste. Na Área reservada, **Teste simulado com a equipe** envia uma ocorrência marcada **SIMULADO**. Use posição simulada no emulador e dispense áudio, ou use áudio sintético com consentimento para validar a reprodução. O treino local do botão flutuante testa o gesto sem enviar dados. O botão flutuante habilitado para alertas envia uma ocorrência real dentro do banco do piloto. Reserve esse ensaio à equipe de teste e encerre a ocorrência no painel após verificá-la.

## APK fora da loja

O aplicativo Android usa package `br.gov.ro.lume.lume_navegador`. O ícone e o nome são Lume Navegador; a função protetiva e as permissões são explicadas durante adesão. Não há mecanismo para esconder os indicadores de microfone ou a notificação do Android.

- Avaliação: `cd apps/mobile && flutter build apk --debug`. O arquivo fica em `build/app/outputs/flutter-apk/app-debug.apk` e permite HTTP somente nos endereços locais explicitados na configuração debug.
- Distribuição: siga o [guia de assinatura, registro e promoção do APK institucional](android-distribution.md). O build release exige a chave custodiada pela instituição.
- Proteger backup da chave, guardar certificado e registrar SHA-256 do APK. Atualizações precisam manter package e certificado de assinatura. O app antigo tinha assinatura/package de desenvolvimento; planeje reinstalação e novo vínculo.
- Hospedar APK e instruções num canal institucional HTTPS. Registrar a identidade de desenvolvedor/package quando exigido pelo ecossistema Android. Distribuir por fora da loja não remove as restrições do sistema.

Não colocar senhas de operador ou token global no APK. O código de vínculo expira em dez minutos, é consumido uma vez e exige adesão no próprio aparelho. Um novo vínculo invalida a credencial anterior; não se substitui aparelho durante ocorrência aberta.

### Publicação do APK para o QR da Central

O QR aponta para `/downloads/lume-navegador.apk` no mesmo domínio HTTPS da Central. O endereço é público e serve somente o APK. O código de vínculo continua separado e de uso único.

1. Valide a assinatura e o SHA-256 do APK escolhido. No piloto, publique somente a versão de avaliação identificada como tal. Para distribuição institucional, use a versão release assinada com a chave custodiada pela instituição.
2. No servidor, crie um diretório de publicação fora do repositório, gravável somente pela administração do deploy. Para o piloto, use `/var/lib/sos-mulher-piloto/downloads`. Copie o APK validado como arquivo regular com permissão `0644` para um nome temporário dentro desse diretório. Renomeie para `lume-navegador.apk` após conferir o hash no servidor. A troca no mesmo diretório evita que um download receba um arquivo ainda em cópia.
3. Defina `APK_DOWNLOAD_DIR=/var/lib/sos-mulher-piloto/downloads` no arquivo de ambiente. Inclua `-f deploy/compose.apk.yaml` após os demais arquivos Compose usados na implantação. O volume é montado apenas no painel e em modo de leitura.

```sh
docker compose -p sos-mulher-piloto --env-file .env.piloto -f compose.yaml -f deploy/compose.traefik.yaml -f deploy/compose.apk.yaml config --quiet
docker compose -p sos-mulher-piloto --env-file .env.piloto -f compose.yaml -f deploy/compose.traefik.yaml -f deploy/compose.apk.yaml up -d --no-deps --build --wait panel
```

Confirme pelo HTTPS que o download responde `200`, com `Content-Type: application/vnd.android.package-archive` e nome `lume-navegador.apk`. Baixe e compare o hash com o APK validado. A pasta `/downloads/` e quaisquer outros nomes nessa pasta devem retornar `404`. Sem arquivo publicado, o endereço do APK também retorna `404`.

## Procedimento de entrada em operação

Definir equipe e escala, responsável por incidente, escalonamento sem reconhecimento, contingência em falta de Internet e atendimento a enganos. O botão de reconhecer não equivale a assumir; atribuir responsabilidade não comprova deslocamento. Esta versão não integra despacho de viaturas, rádio, sistemas de boletim ou SMS.

Realizar a matriz em [acceptance.md](acceptance.md), corrigir falhas por fabricante e registrar os resultados. O controle de sensores depende do aparelho receber o encerramento; a assistida pode interromper novas capturas localmente mesmo sem rede. Uma ocorrência de treinamento pode ser promovida a real por novo acionamento; a central reavisa e mantém sua trilha.

## Reversão

Conservar APK anterior assinado com a mesma chave e backup consistente anterior à atualização. Nenhuma implantação deste repositório migra ou encerra automaticamente o Firebase antigo. Se a V2 ficar indisponível, ativar o procedimento de contingência da equipe; não presumir que o app encaminhou automaticamente para outro canal.

## Mapas e identidade visual

O endpoint padrão de tiles OSM é para demonstração/avaliação. O provedor recebe o IP e a área do mapa solicitada; para atendimento real, configurar VITE_MAP_TILE_URL e VITE_MAP_ATTRIBUTION com cartografia institucional ou contrato adequado. Essas variáveis são públicas e embutidas no build Vite: mudar exige reconstruir o painel. Não inserir segredo de provedor no frontend. Atribuição de um provedor personalizado é obrigatória.

Os PNGs gerados e prompts estão em design/generated/v2 e docs/visual-prompts.json. A galeria /motion-preview.html não acessa dados da API e permite conferir estados animados. O frontend respeita prefers-reduced-motion; o celular não anima nem produz som em resposta ao disparo.
