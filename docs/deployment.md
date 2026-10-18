# Implantação institucional

A demonstração local usa somente dados fictícios. Não conectar assistidas reais até que servidor, operação de plantão e aparelhos tenham sido homologados em conjunto.

## Servidor e painel

O pacote inclui Dockerfiles e `compose.yaml` para uma instância de API e um painel Nginx com proxy de mesma origem. Requer Docker Engine e Compose v2 no servidor. O servidor deve ter volume persistente criptografado, backup restaurável e relógio sincronizado.

1. Copie `.env.example` para `.env` fora do Git; defina domínio HTTPS em `PANEL_ORIGIN`, agência operacional, nome/e-mail e senha inicial forte de pelo menos 14 caracteres. O arquivo não é enviado ao repositório. Mantenha permissões de leitura restritas.
2. Em uma máquina de implantação: `docker compose --env-file .env up -d --build`.
3. O painel escuta somente `127.0.0.1:8080` no host. Configure o proxy TLS institucional apontando para esse endereço. Preserve o cabeçalho `Origin`; encaminhe `/api/events` sem buffering/cache, com timeout acima de 30s. Não exponha a porta da API diretamente. Este Compose usa TRUST_PROXY_HOPS=2 para a cadeia fixa proxy TLS → Nginx privado → API privada. O proxy TLS DEVE sobrescrever X-Forwarded-For com o IP do cliente (não anexar valores enviados pelo cliente); o Nginx interno acrescenta o peer. Para outra topologia, ajustar a contagem de saltos e repetir os testes de IP/rate limit; padrão fora deste Compose é zero.
4. Valide login, logout, reconexão SSE, reprodução de áudio, cadastro e acionamento em HTTPS. Defina limites por IP no gateway; a API não confia em `X-Forwarded-For`.
5. Cadastre contas individuais para PM, PC e Guarda, com `agencyId` compartilhado somente quando a cooperação e o acesso estiverem definidos. O bootstrap cria apenas o primeiro administrador; provisionamento adicional usa o CLI `node dist/operator.js` na imagem da API, com as variáveis OPERATOR_EMAIL, OPERATOR_NAME, OPERATOR_ROLE (admin/dispatcher/observer), OPERATOR_AGENCY_ID e OPERATOR_PASSWORD injetadas pelo gerenciador de segredos. Ele exige banco institucional inicializado, recusa demo e contas duplicadas, e não imprime credenciais. Não existe cadastro público de operadores. A interface não oferece gerenciamento completo de identidades/MFA.

`ADMIN_PASSWORD` só provisiona um banco vazio, não altera uma conta existente. Nunca reutilizar a conta demo em produção. O processo recusa demonstração em produção e recusa banco já populado como demo. A senha de bootstrap fica no ambiente do container; use gerenciamento de segredos da instituição e remova-a da configuração após a criação, preservando a forma de iniciar o banco existente.

O banco é montado em `/data/mulher-lume.sqlite`. Não use várias réplicas com esse arquivo. Faça backups consistentes pela API de backup SQLite ou pare a API para copiar banco, WAL e SHM como conjunto. Teste restauração em ambiente isolado. Não anexar backups a issues, Git ou logs.

Monitorar `/api/health`, espaço em disco, falhas de gravação, disponibilidade do stream e a sessão de plantão. Um endpoint saudável não garante operador atento. Áudio cresce continuamente durante ocorrência; definir prazo de guarda, procedimento de exportação autorizada, descarte e alarmes de armazenamento antes da operação. A aplicação não executa descarte automático arbitrário de evidências.

## APK fora da loja

O aplicativo Android usa package `br.gov.ro.lume.lume_navegador`. O ícone e o nome são Lume Navegador; a função protetiva e as permissões são explicadas durante adesão. Não há mecanismo para esconder os indicadores de microfone ou a notificação do Android.

- Avaliação: `cd apps/mobile && flutter build apk --debug`. O arquivo fica em `build/app/outputs/flutter-apk/app-debug.apk` e permite HTTP somente nos endereços locais explicitados na configuração debug.
- Distribuição: criar e custodiar keystore institucional fora do Git; configurar `android/key.properties` usando o [modelo](../apps/mobile/android/key.properties.example) e executar `flutter build apk --release --dart-define=API_BASE_URL=https://central.exemplo.gov.br`. Sem chave, o build release falha deliberadamente.
- Proteger backup da chave, guardar certificado e registrar SHA-256 do APK. Atualizações precisam manter package e certificado de assinatura. O app antigo tinha assinatura/package de desenvolvimento; planeje reinstalação e novo vínculo.
- Hospedar APK e instruções num canal institucional HTTPS. Registrar a identidade de desenvolvedor/package quando exigido pelo ecossistema Android. Distribuir por fora da loja não remove as restrições do sistema.

Não colocar senhas de operador ou token global no APK. O código de vínculo expira em dez minutos, é consumido uma vez e exige adesão no próprio aparelho. Um novo vínculo invalida a credencial anterior; não se substitui aparelho durante ocorrência aberta.

## Procedimento de entrada em operação

Definir equipe e escala, responsável por incidente, escalonamento sem reconhecimento, contingência em falta de Internet e atendimento a enganos. O botão de reconhecer não equivale a assumir; atribuir responsabilidade não comprova deslocamento. Esta versão não integra despacho de viaturas, rádio, sistemas de boletim ou SMS.

Realizar a matriz em [acceptance.md](acceptance.md), corrigir falhas por fabricante e registrar os resultados. O controle de sensores depende do aparelho receber o encerramento; a assistida pode interromper novas capturas localmente mesmo sem rede. Uma ocorrência de treinamento pode ser promovida a real por novo acionamento; a central reavisa e mantém sua trilha.

## Reversão

Conservar APK anterior assinado com a mesma chave e backup consistente anterior à atualização. Nenhuma implantação deste repositório migra ou encerra automaticamente o Firebase antigo. Se a V2 ficar indisponível, ativar o procedimento de contingência da equipe; não presumir que o app encaminhou automaticamente para outro canal.

## Mapas e identidade visual

O endpoint padrão de tiles OSM é para demonstração/avaliação. O provedor recebe o IP e a área do mapa solicitada; para atendimento real, configurar VITE_MAP_TILE_URL e VITE_MAP_ATTRIBUTION com cartografia institucional ou contrato adequado. Essas variáveis são públicas e embutidas no build Vite: mudar exige reconstruir o painel. Não inserir segredo de provedor no frontend. Atribuição de um provedor personalizado é obrigatória.

Os PNGs gerados e prompts estão em design/generated/v2 e docs/visual-prompts.json. A galeria /motion-preview.html não acessa dados da API e permite conferir estados animados. O frontend respeita prefers-reduced-motion; o celular não anima nem produz som em resposta ao disparo.
