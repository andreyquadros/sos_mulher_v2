# Evidências de validação — 18/10/2026

## Verificações executadas

| Área | Evidência local |
|---|---|
| API | `npm --prefix services/api run build` aprovado; 19/19 testes de integração/provisionamento aprovados |
| Painel | Build TypeScript/Vite aprovado; 14/14 testes aprovados; Prettier e verificação de símbolos não usados aprovados |
| Flutter | `flutter analyze` sem problemas; 8/8 testes de widget/estado aprovados |
| Kotlin | `:app:testDebugUnitTest` aprovado, 8/8 testes; `:app:assembleDebug` aprovado |
| Assinatura | Build release sem chave recusado com mensagem de assinatura institucional, conforme requisito |
| Dependências | `npm audit --omit=dev` da API e do painel sem vulnerabilidades conhecidas na consulta executada |
| Entrega local | Scripts Node validados; sintaxe YAML de Compose/CI validada; Docker não executado por ausência de daemon/Compose no ambiente |

API: sessão/CSRF, expiração, agência/RBAC, código único, revogação, repetição, localização fora de ordem, promoção teste→real, concorrência, áudio privado/consentimento, persistência/reinício, demo, SSE e proxies controlados estão cobertos. A CLI recusa banco demo/vazio e conta duplicada.

Flutter: toque breve não dispara; pressão sustentada cria uma única ação; botão desabilitado não dispara; consentimento obrigatório para vínculo; credencial cancelada não abre área reservada e saída para segundo plano fecha a tela privada; fila/recebimento/reconhecimento/responsável têm estados distintos; ocorrência aberta mantém reativação, pausa e promoção real disponíveis.

## Verificação visual

No navegador, usando somente dados fictícios: login, snapshot de três ocorrências, mapa/atribuição/posição antiga, reconhecimento sem atribuir responsável, atribuição confirmada e cadastro de uma pessoa fictícia funcionaram. A revisão corrigiu a limpeza de tooltips no mapa e a idade da ocorrência mais antiga após reconhecimento.

As imagens V2 foram geradas pelo image_gen com o template Brand Identity Package (case354), usando os PNGs fornecidos como referência. Lume1254×1254 RGB; SOS1254×1254 RGBA com transparência verificada. Originais e prompts estão preservados. Galeria visual testada no navegador: animações de recebimento, reconexão, confirmação, pressão3s e alternativa com movimento reduzido. A galeria não cria alerta, abre sensores ou reproduz som.

## Integração Android

APK debug compilado e instalado no AVD Android14. O emulador32.1.14 apresentou falha bionic/allocator ao carregar snapshot antigo; coldboot sem snapshot recuperou boot, PackageManager e comandos do sistema. Nenhum SDK global foi atualizado nem licença aceita nesta atividade.

O teste instrumental `integration_test/device_flow_test.dart` PASSOU (1/1, 15 segundos após instalação): vínculo real com a API demo, serviço foreground ativo, ocorrência confirmada, posição com precisão recebida, blocos AAC recebidos, pausa local, reconhecimento, atribuição, encerramento pela central e término do estado ativo no aparelho. O servidor confirma SIMULADO. A primeira execução foi interrompida por uso inadequado de runAsync no harness; o teste foi corrigido para aguardar chamadas na agenda viva do dispositivo e a execução seguinte foi aprovada. As permissões foram pré-concedidas somente ao app fictício no emulador; ele foi iniciado sem entrada/saída de áudio do host. Os blocos comprovam o caminho de captura/arquivo/upload; não comprovam captação acústica em um telefone físico.

## Limites da evidência

Não houve implantação em servidor institucional, cadastro real, despacho policial, assinatura de release institucional ou teste em aparelho físico. Dockerfiles/Compose foram revisados, mas a imagem completa não foi construída localmente. Os testes não comprovam funcionamento universal em tela bloqueada, Doze, todos os fabricantes, consumo de bateria ou prazo de atendimento. A matriz em acceptance.md permanece necessária antes do atendimento real.

A proteção da área reservada usa a credencial do próprio aparelho via KeyguardManager e FLAG_SECURE na janela privada. Testes de widget verificaram autorização/cancelamento e fechamento ao background; a UI de credencial real não foi exercitada no emulador sem PIN, devendo ser homologada em aparelho com bloqueio seguro. Emergência pela confirmação genérica permanece independente dessa autenticação.
