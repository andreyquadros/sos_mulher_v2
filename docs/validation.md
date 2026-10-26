# Evidências de validação

## Acionamento simplificado — 25/10/2026

Implementação Android **2.4.0+6**: botão flutuante Lume com pressão contínua de 5s, treino local e habilitação real separados. A área reservada pareada mostra a ação principal, remoção do botão e pausa na primeira tela; voz, volume e diagnóstico ficam recolhidos. O botão é ocultado ao bloquear ou apagar a tela.

APKs debug compilados para ARM64, ARM32 e x86_64. As oito imagens públicas de navegador/launcher de cada APK são idênticas às da versão2.3.0; nenhum dos três contém fixtures de vínculo da instrumentação, e todos incluem o modelo de voz offline. Os binários e SHA256 ficam em `artifacts/`, fora do Git. A assinatura permanece de avaliação debug; não foi feita distribuição institucional.

| Validação executada | Resultado |
|---|---|
| API | 26 testes aprovados e build TypeScript aprovado |
| Painel | 35 testes aprovados e build TypeScript/Vite aprovado |
| Flutter | Análise sem problemas; 54 testes aprovados; um exportador opcional de imagens é ignorado quando seu diretório não é informado |
| Kotlin | 56 testes JVM aprovados, incluindo seis da política monotônica de 5s, cancelamento, relógio regressivo, fila de UI parada e cooldown |
| Sobreposição Android | `npm run test:android:floating`: 1/1 aprovado, zero ignorados/falhas/erros |
| Atalho físico | `npm run test:android:physical`: 1/1 aprovado, cinco fases de eventos de volume concluídas |
| Voz | `npm run test:android:voice`: 2/2 aprovados; microfone sob bloqueio/tela apagada e decoder Vosk com fala sintética |
| Integração do app | `integration_test/device_flow_test.dart`: 1/1 aprovado, do vínculo até encerramento confirmado pela central |

O ensaio da sobreposição operou uma janela Android real com o app em segundo plano: recusa sem permissão/treino, soltura antecipada, `ACTION_CANCEL`, arraste, treino sem ocorrência/fila, habilitação separada, revogação de permissão exigindo novo treino, ocultação com tela apagada, alerta confirmado pela API demo, cooldown sem duplicação e remoção ao interromper compartilhamento. O reposicionamento também foi confirmado durante o cooldown, preservando o mesmo incidente.

O driver verifica que somente um emulador está conectado e recusa telefones físicos. A fixture e o log usam permissão `0600` e ficam fora do Git. A aprovação exige XML novo com testes realmente executados, sem ignorados, falhas ou erros. A configuração de teste concede sobreposição somente no AVD; o aplicativo distribuído abre as configurações do Android e exige autorização da assistida. O encerramento remove a fixture e revoga a permissão ou confirma que o Gradle já desinstalou o app. O ensaio físico foi filtrado para sua própria classe, evitando executar outros ensaios sem suas fixtures.

Uma rodada após o teste de voz encontrou a tela de bloqueio não segura ainda aberta no AVD: o botão permaneceu oculto, como previsto. A preparação do teste foi corrigida para acordar e confirmar o desbloqueio de um AVD **sem credencial**, antes de iniciar o treino; emulador com credencial continua recusado. A rodada definitiva passou. O limite de autenticação também recusou preparações repetidas; a nova rodada usou outra instância demo descartável em memória, preservando o limite da aplicação.

O smoke HTTP adicional usou banco em memória e porta aleatória: login, cadastro/vínculo fictício, alerta `hold`, retry idempotente, SSE, posição fictícia, áudio sintético privado, reconhecimento sem atribuição, assumir, encerrar e logout com revogação. No navegador, foram conferidos mapa, reconhecimento/atribuição separados, chegada do alerta Android sem recarregar e reprodução privada de um bloco do emulador. A galeria didática também cancela em 1s e conclui somente após 5s, inclusive com movimento reduzido.

Os ensaios Android ocorreram no AVD Pixel3a API34, iniciado sem áudio de entrada/saída do host, e com API demo em memória. A integração recebeu GPS e blocos AAC, pausou a captura e confirmou o encerramento pelo painel; isso verifica o caminho de captura/envio, sem comprovar captação acústica ou autonomia em um telefone físico. Não foram concedidas notificações do navegador nem testado despacho policial real. Nenhum banco persistente com dados do celular foi usado nos testes.

Prévias atualizadas em [design/previews/floating](../design/previews/floating), renderizadas com widgets Flutter e fixtures; a captura do painel usa dados fictícios. Os testes de layout confirmam controles principais na primeira tela de 390×844 e ausência de overflow em 320px com fonte 1,6. O nome, o ícone e a tela pública continuam como Lume Navegador. Não houve instalação automática em um telefone: nenhum estava conectado. Homologação por fabricante, uso prolongado em bateria/Doze e operação institucional continuam pendentes.

## Onboarding e movimento — 20/10/2026

- APK Android **2.3.0+5** compilado em debug para ARM64, ARM32 e x86_64. Nome do pacote preservado. Nenhuma fixture de instrumentação está nos APKs; o modelo offline de voz continua incluído. As oito imagens públicas de ícone/navegador comparadas com o APK2.2.1 são idênticas, e fontes da tela inicial, manifesto e recursos públicos permanecem sem alterações.
- **45 testes Flutter aprovados**, incluindo onze casos novos do guia: três acessos, persistência e consulta manual, autenticação cancelada, falha do canal/armazenamento, prioridade de ocorrência, ciclo de vida, respostas tardias, operação em andamento, nova ocorrência após uma anterior e demonstração visual sem executar comandos. Análise Flutter limpa.
- **50 testes JVM do app aprovados**, incluindo oito casos do contador privado de até três apresentações, falha de gravação, leituras inválidas e idempotência por sessão autenticada.
- **26 testes da API aprovados**, incluindo sessão/origem/versão do guia, isolamento por operador e agência, conclusão pelo perfil de consulta sem novos privilégios e persistência entre logout e reinicialização. Build TypeScript aprovado.
- **35 testes do painel aprovados**, cobrindo sessão, persistência, erros e retry, saída operacional, estrutura sem áudio, perfis de acesso e prioridade de alertas. As regressões finais verificam respostas tardias da permissão de notificações após logout/expiração e foco aplicado ao título correto depois da navegação. Build TypeScript/Vite aprovado.
- A verificação em navegador usou **API demo isolada em memória**, sem celular, localização ou áudio reais. O guia apareceu automaticamente após login com fila vazia; um evento simulado recebido via SSE fechou a orientação; consulta manual e conclusão sobreviveram ao recarregamento. “Ir aos alertas” a partir de Assistidas fechou o guia, abriu a central e focou seu título após a navegação. Não foram concedidas permissões de notificação nem reproduzido áudio no teste visual.
- Prévias reais do widget Flutter, incluindo fonte ampliada e movimento reduzido, e captura da central em [design/previews/onboarding](../design/previews/onboarding). Essas imagens usam fixtures e não contornam a autenticação de um celular.

Esta validação cobre a orientação e sua integração. Os treinos físicos e acústicos no Samsung continuam independentes; o novo APK não foi instalado automaticamente em um aparelho durante esta alteração.

## Verificações executadas

| Área | Evidência local |
|---|---|
| API | `npm --prefix services/api run build` aprovado; 23/23 testes de integração/provisionamento/migração aprovados |
| Painel | Build TypeScript/Vite aprovado; 14/14 testes aprovados; Prettier e verificação de símbolos não usados aprovados |
| Flutter | `flutter analyze` sem problemas; 34/34 testes de widget/estado aprovados |
| Kotlin | `:app:testDebugUnitTest` aprovado, 42/42 testes; APK e instrumentação compilados |
| Acionamento sob keyguard | `npm run test:android:physical` aprovado, 1/1 AndroidJUnit no AVD API34 com PIN de teste; GPS/AAC recebidos pela API demo |
| Voz — microfone e decoder | `npm run test:android:voice` aprovado, 2/2 AndroidJUnit: AudioRecord real com tela apagada/keyguard e Vosk nativo com três fixtures PCM sintéticas |
| Assinatura | Build release sem chave recusado com mensagem de assinatura institucional, conforme requisito |
| Dependências | `npm audit --omit=dev` da API e do painel sem vulnerabilidades conhecidas na consulta executada |
| Entrega local | Scripts Node validados; sintaxe YAML de Compose/CI validada; Docker não executado por ausência de daemon/Compose no ambiente |

API: sessão/CSRF, expiração, agência/RBAC, código único, revogação, repetição, localização fora de ordem, promoção teste→real, concorrência, áudio privado/consentimento, persistência/reinício, demo, SSE e proxies controlados estão cobertos. A CLI recusa banco demo/vazio e conta duplicada.

Flutter: toque breve não dispara; pressão sustentada cria uma única ação; botão desabilitado não dispara; consentimento obrigatório para vínculo; credencial cancelada não abre área reservada e saída para segundo plano fecha a tela privada; fila/recebimento/reconhecimento/responsável têm estados distintos; ocorrência aberta mantém reativação, pausa e promoção real disponíveis.

O cartão físico acrescenta onze testes de consentimento, treino sem ocorrência, habilitação separada, prontidão, conflito de acessibilidade e fechamento dos diálogos privados no background. Os dezenove testes da sequência Kotlin cobrem cliques/intervalos/hold/janela, ordem e sobreposição, cancelamento, replay, repetições, cooldown, relógios separados para gesto/suspensão e 2.000 ações aleatórias sem alerta; seis políticas gerais completam os 25 JVM.

O cartão de voz acrescenta treze testes Flutter de consentimento próprio, seleção de frase, prova bloqueada, habilitação real separada, prontidão e fechamento dos diálogos ao background. Dezessete novos testes JVM verificam texto/palavras exatos, confiança finita, duração, intervalos, duas falas independentes, resultados antigos/repetidos, timeout, reset e cooldown. Com os testes anteriores, totalizam 32 Flutter e 42 JVM.

A API agora testa voz como origem, idempotência/isolamento e rejeição de texto/áudio de treino no payload. Três testes de migração usam o schema legado real: preservação de dados/FKs/aliases/índices/views/triggers/telemetria/auditoria e reabertura idempotente, rollback com falha referencial e recusa de versão futura/colunas desconhecidas. Total: 23 testes API; painel mantém 14.

## Verificação visual

No navegador, usando somente dados fictícios: login, snapshot de três ocorrências, mapa/atribuição/posição antiga, reconhecimento sem atribuir responsável, atribuição confirmada e cadastro de uma pessoa fictícia funcionaram. A revisão corrigiu a limpeza de tooltips no mapa e a idade da ocorrência mais antiga após reconhecimento.

As imagens V2 foram geradas pelo image_gen com o template Brand Identity Package (case354), usando os PNGs fornecidos como referência. Lume1254×1254 RGB; SOS1254×1254 RGBA com transparência verificada. Originais e prompts estão preservados. Galeria visual testada no navegador: animações de recebimento, reconexão, confirmação, pressão3s e alternativa com movimento reduzido. A galeria não cria alerta, abre sensores ou reproduz som.

A marca SOS V3 foi gerada pelo image_gen a partir da nova referência, com o mesmo template e tags 3D/Illustration. Emblema e símbolo compacto:1254×1254 RGBA, com transparência verificada. Exportações do painel em720/256/64px preservam os originais. Tela de acesso conferida no navegador local: emblema completo, símbolo do cabeçalho e texto legíveis, sem imagem quebrada ou recorte no viewport observado (911×898). Prévia em `design/previews/v3/panel-login-v3.png`; referência e prompts preservados. Build do painel,14testes e Prettier aprovados. Lume e o fluxo Android não receberam alterações nesta revisão visual.

Na revisão Android2.2.1, a identidade aprovada foi aplicada à área reservada e seus diálogos por um tema local. Dois testes adicionais passaram: ausência de marca/tema SOS antes e após a rota autenticada, fechamento de marca/diálogo ao background sem acionar sensores, e layout320px com texto1,6x sem overflow. Suíte completa34/34 e análise sem problemas. Arquivos públicos de `main.dart`, `browser.dart`, ícone Flutter, Manifest Android e recursos de launcher/splash/estilos/strings foram comparados por SHA256:14/14 idênticos ao commit anterior. Código nativo e fluxos de consentimento não mudaram. Prévias780×1688 em `design/previews/mobile-v3/` foram renderizadas a partir dos widgets reais em teste, com fontes/ícones carregados e estado fictício; não são capturas de um aparelho físico nem contornam `FLAG_SECURE` do APK.

## Integração Android

APK debug compilado e instalado no AVD Android14. O emulador32.1.14 apresentou falha bionic/allocator ao carregar snapshot antigo; coldboot sem snapshot recuperou boot, PackageManager e comandos do sistema. Nenhum SDK global foi atualizado nem licença aceita nesta atividade.

O teste instrumental `integration_test/device_flow_test.dart` PASSOU (1/1, 15 segundos após instalação): vínculo real com a API demo, serviço foreground ativo, ocorrência confirmada, posição com precisão recebida, blocos AAC recebidos, pausa local, reconhecimento, atribuição, encerramento pela central e término do estado ativo no aparelho. O servidor confirma SIMULADO. A primeira execução foi interrompida por uso inadequado de runAsync no harness; o teste foi corrigido para aguardar chamadas na agenda viva do dispositivo e a execução seguinte foi aprovada. As permissões foram pré-concedidas somente ao app fictício no emulador; ele foi iniciado sem entrada/saída de áudio do host. Os blocos comprovam o caminho de captura/arquivo/upload; não comprovam captação acústica em um telefone físico.

O ensaio `PhysicalTriggerDeviceTest` PASSOU (1/1) com o app em segundo plano e keyguard seguro mantido, no AVD Pixel3a Android14/API34. Verificou: sequência correta desbloqueada rejeitada como treino; pressão final curta rejeitada; treino bloqueado aprovado sem incidente ou fila; habilitação real separada; alerta recebido com GPS e AAC; repetição durante os 30s de cooldown sem retomar sensores depois de `stopSharing`. A API demo manteve a ocorrência SIMULADA. O microfone do host continuou desativado.

O driver Node envia EV_KEY/SYN por `sendevent` ao teclado descoberto no kernel do AVD. Usa ADB root apenas no ambiente de teste isolado e restaura `unroot`; o APK conserva seu UID normal e suas permissões. A fixture de código efêmero e o log usam `0600`, ficam ignorados pelo Git e a cópia de fixture no AndroidTest é removida após executar. `UiAutomation.injectInputEvent` não percorreu o filtro global, e a versão antiga do console do emulador retornou OK sem gerar eventos verificáveis; esses métodos foram substituídos no harness, sem exceção no código produtivo. Coldboot sem janela, quatro CPUs e 4GiB evitaram os ANRs de inicialização do emulador antigo com uma CPU. Nenhum SDK global foi atualizado.

## Limites da evidência

O ensaio de voz `npm run test:android:voice` PASSOU (2/2) no mesmo AVD Android14/API34, sem entrada/saída de áudio do host. `VoiceTriggerDeviceTest` validou vínculo fictício, serviço armado, recusa sem consentimento/prova, carga do modelo, abertura de AudioRecord real, continuidade com app em segundo plano/tela apagada/keyguard seguro por seis segundos, ausência de ocorrência/fila durante treino e parada imediata pela ação da notificação, sem desbloquear. A sessão de gravação foi liberada e o recurso não se reativou após pausa. O PIN de teste e a fixture privada são removidos; o driver também tenta restaurar o PIN em falha/timeout. O APK de produção não recebe privilégio de teste.

Separadamente, `VoiceRecognitionTest` usou o Vosk nativo real, o modelo português incorporado e três WAV de fala sintética local (Luciana pt_BR). Duas frases exatas produziram confirmação, uma frase deixou só a espera da segunda, e fala semelhante/irrelevante não avançou a confirmação. Os filtros de confiança de 0,85 e tempo foram mantidos. As fixtures ficam apenas no APK androidTest; o reconhecedor de produção não recebe transcrições/áudio injetados. O primeiro teste do decoder identificou um caminho de cache do APK de teste sem permissão de escrita; foi corrigido para o cache privado do app e a execução seguinte completa passou. Esse ensaio valida o decoder e a política, não a acústica física pelo microfone nem o caminho positivo completo de voz→alerta em aparelho real.

Preparação do modelo verificada por SHA256 e 14 hashes de arquivos. Vosk/JNA fixados; segmentos ELF Vosk ARM64/x86_64 conferidos com alinhamento de 16KiB. A migração SQLite passou com os dados de teste legados preservados. Veja [build/modelo](voice-model-build.md), [regras de voz](voice-trigger.md) e [aceitação física](acceptance.md).

Não houve implantação em servidor institucional, cadastro real, despacho policial, assinatura de release institucional ou teste em aparelho físico. Dockerfiles/Compose foram revisados, mas a imagem completa não foi construída localmente. Os testes não comprovam funcionamento universal em tela bloqueada, Doze, todos os fabricantes, consumo de bateria ou prazo de atendimento. A matriz em acceptance.md permanece necessária antes do atendimento real.

A proteção da área reservada usa a credencial do próprio aparelho via KeyguardManager e FLAG_SECURE na janela privada. Testes de widget verificaram autorização/cancelamento e fechamento ao background; a UI de confirmação da credencial real ainda precisa de homologação. O PIN do novo ensaio validou somente o keyguard do acionamento físico. Emergência pela confirmação genérica permanece independente dessa autenticação.
