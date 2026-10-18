# Evidências de validação — 18/10/2026

## Verificações executadas

| Área | Evidência local |
|---|---|
| API | `npm --prefix services/api run build` aprovado; 19/19 testes de integração/provisionamento aprovados |
| Painel | Build TypeScript/Vite aprovado; 14/14 testes aprovados; Prettier e verificação de símbolos não usados aprovados |
| Flutter | `flutter analyze` sem problemas; 19/19 testes de widget/estado aprovados |
| Kotlin | `:app:testDebugUnitTest` aprovado, 25/25 testes; `:app:assembleDebug` aprovado |
| Acionamento sob keyguard | `npm run test:android:physical` aprovado, 1/1 AndroidJUnit no AVD API34 com PIN de teste; GPS/AAC recebidos pela API demo |
| Assinatura | Build release sem chave recusado com mensagem de assinatura institucional, conforme requisito |
| Dependências | `npm audit --omit=dev` da API e do painel sem vulnerabilidades conhecidas na consulta executada |
| Entrega local | Scripts Node validados; sintaxe YAML de Compose/CI validada; Docker não executado por ausência de daemon/Compose no ambiente |

API: sessão/CSRF, expiração, agência/RBAC, código único, revogação, repetição, localização fora de ordem, promoção teste→real, concorrência, áudio privado/consentimento, persistência/reinício, demo, SSE e proxies controlados estão cobertos. A CLI recusa banco demo/vazio e conta duplicada.

Flutter: toque breve não dispara; pressão sustentada cria uma única ação; botão desabilitado não dispara; consentimento obrigatório para vínculo; credencial cancelada não abre área reservada e saída para segundo plano fecha a tela privada; fila/recebimento/reconhecimento/responsável têm estados distintos; ocorrência aberta mantém reativação, pausa e promoção real disponíveis.

O cartão físico acrescenta onze testes de consentimento, treino sem ocorrência, habilitação separada, prontidão, conflito de acessibilidade e fechamento dos diálogos privados no background. Os dezenove testes da sequência Kotlin cobrem cliques/intervalos/hold/janela, ordem e sobreposição, cancelamento, replay, repetições, cooldown, relógios separados para gesto/suspensão e 2.000 ações aleatórias sem alerta; seis políticas gerais completam os 25 JVM.

## Verificação visual

No navegador, usando somente dados fictícios: login, snapshot de três ocorrências, mapa/atribuição/posição antiga, reconhecimento sem atribuir responsável, atribuição confirmada e cadastro de uma pessoa fictícia funcionaram. A revisão corrigiu a limpeza de tooltips no mapa e a idade da ocorrência mais antiga após reconhecimento.

As imagens V2 foram geradas pelo image_gen com o template Brand Identity Package (case354), usando os PNGs fornecidos como referência. Lume1254×1254 RGB; SOS1254×1254 RGBA com transparência verificada. Originais e prompts estão preservados. Galeria visual testada no navegador: animações de recebimento, reconexão, confirmação, pressão3s e alternativa com movimento reduzido. A galeria não cria alerta, abre sensores ou reproduz som.

## Integração Android

APK debug compilado e instalado no AVD Android14. O emulador32.1.14 apresentou falha bionic/allocator ao carregar snapshot antigo; coldboot sem snapshot recuperou boot, PackageManager e comandos do sistema. Nenhum SDK global foi atualizado nem licença aceita nesta atividade.

O teste instrumental `integration_test/device_flow_test.dart` PASSOU (1/1, 15 segundos após instalação): vínculo real com a API demo, serviço foreground ativo, ocorrência confirmada, posição com precisão recebida, blocos AAC recebidos, pausa local, reconhecimento, atribuição, encerramento pela central e término do estado ativo no aparelho. O servidor confirma SIMULADO. A primeira execução foi interrompida por uso inadequado de runAsync no harness; o teste foi corrigido para aguardar chamadas na agenda viva do dispositivo e a execução seguinte foi aprovada. As permissões foram pré-concedidas somente ao app fictício no emulador; ele foi iniciado sem entrada/saída de áudio do host. Os blocos comprovam o caminho de captura/arquivo/upload; não comprovam captação acústica em um telefone físico.

O ensaio `PhysicalTriggerDeviceTest` PASSOU (1/1) com o app em segundo plano e keyguard seguro mantido, no AVD Pixel3a Android14/API34. Verificou: sequência correta desbloqueada rejeitada como treino; pressão final curta rejeitada; treino bloqueado aprovado sem incidente ou fila; habilitação real separada; alerta recebido com GPS e AAC; repetição durante os 30s de cooldown sem retomar sensores depois de `stopSharing`. A API demo manteve a ocorrência SIMULADA. O microfone do host continuou desativado.

O driver Node envia EV_KEY/SYN por `sendevent` ao teclado descoberto no kernel do AVD. Usa ADB root apenas no ambiente de teste isolado e restaura `unroot`; o APK conserva seu UID normal e suas permissões. A fixture de código efêmero e o log usam `0600`, ficam ignorados pelo Git e a cópia de fixture no AndroidTest é removida após executar. `UiAutomation.injectInputEvent` não percorreu o filtro global, e a versão antiga do console do emulador retornou OK sem gerar eventos verificáveis; esses métodos foram substituídos no harness, sem exceção no código produtivo. Coldboot sem janela, quatro CPUs e 4GiB evitaram os ANRs de inicialização do emulador antigo com uma CPU. Nenhum SDK global foi atualizado.

## Limites da evidência

Não houve implantação em servidor institucional, cadastro real, despacho policial, assinatura de release institucional ou teste em aparelho físico. Dockerfiles/Compose foram revisados, mas a imagem completa não foi construída localmente. Os testes não comprovam funcionamento universal em tela bloqueada, Doze, todos os fabricantes, consumo de bateria ou prazo de atendimento. A matriz em acceptance.md permanece necessária antes do atendimento real.

A proteção da área reservada usa a credencial do próprio aparelho via KeyguardManager e FLAG_SECURE na janela privada. Testes de widget verificaram autorização/cancelamento e fechamento ao background; a UI de confirmação da credencial real ainda precisa de homologação. O PIN do novo ensaio validou somente o keyguard do acionamento físico. Emergência pela confirmação genérica permanece independente dessa autenticação.
