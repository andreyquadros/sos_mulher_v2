# Evidências de validação — 18/10/2026

## Verificações executadas

| Área | Evidência local |
|---|---|
| API | `npm --prefix services/api run build` aprovado; 23/23 testes de integração/provisionamento/migração aprovados |
| Painel | Build TypeScript/Vite aprovado; 14/14 testes aprovados; Prettier e verificação de símbolos não usados aprovados |
| Flutter | `flutter analyze` sem problemas; 32/32 testes de widget/estado aprovados |
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
