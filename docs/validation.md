# Evidências de validação — 18/10/2026

## Verificações executadas

| Área | Evidência local |
|---|---|
| API | `npm --prefix services/api run build` aprovado; 19/19 testes de integração/provisionamento aprovados |
| Painel | Build TypeScript/Vite aprovado; 14/14 testes aprovados; Prettier e verificação de símbolos não usados aprovados |
| Flutter | `flutter analyze` sem problemas; 6/6 testes de widget/estado aprovados |
| Kotlin | `:app:testDebugUnitTest` aprovado, 8/8 testes; `:app:assembleDebug` aprovado |
| Assinatura | Build release sem chave recusado com mensagem de assinatura institucional, conforme requisito |
| Dependências | `npm audit --omit=dev` da API e do painel sem vulnerabilidades conhecidas na consulta executada |
| Entrega local | Scripts Node validados; sintaxe YAML de Compose/CI validada; Docker não executado por ausência de daemon/Compose no ambiente |

API: sessão/CSRF, expiração, agência/RBAC, código único, revogação, repetição, localização fora de ordem, promoção teste→real, concorrência, áudio privado/consentimento, persistência/reinício, demo, SSE e proxies controlados estão cobertos. A CLI recusa banco demo/vazio e conta duplicada.

Flutter: toque breve não dispara; pressão sustentada cria uma única ação; botão desabilitado não dispara; consentimento obrigatório para vínculo; fila/recebimento/reconhecimento/responsável têm estados distintos; ocorrência aberta mantém reativação, pausa e promoção real disponíveis.

## Verificação visual

No navegador, usando somente dados fictícios: login, snapshot de três ocorrências, mapa/atribuição/posição antiga, reconhecimento sem atribuir responsável, atribuição confirmada e cadastro de uma pessoa fictícia funcionaram. A revisão corrigiu a limpeza de tooltips no mapa e a idade da ocorrência mais antiga após reconhecimento.

As imagens V2 foram geradas pelo image_gen com o template Brand Identity Package (case354), usando os PNGs fornecidos como referência. Lume1254×1254 RGB; SOS1254×1254 RGBA com transparência verificada. Originais e prompts estão preservados. Galeria visual testada no navegador: animações de recebimento, reconexão, confirmação, pressão3s e alternativa com movimento reduzido. A galeria não cria alerta, abre sensores ou reproduz som.

## Integração Android

APK debug compilado e instalado no AVD Android14. O emulador32.1.14 apresentou falha bionic/allocator ao carregar snapshot antigo; coldboot sem snapshot recuperou boot, PackageManager e comandos do sistema. Nenhum SDK global foi atualizado nem licença aceita nesta atividade.

O teste instrumental `integration_test/device_flow_test.dart` está sendo executado; o resultado será registrado após a conclusão. A primeira execução foi interrompida após bloqueio do harness e não conta como aprovação. As permissões são pré-concedidas somente ao aplicativo fictício no emulador; o emulador é iniciado sem entrada/saída de áudio do host.

## Limites da evidência

Não houve implantação em servidor institucional, cadastro real, despacho policial, assinatura de release institucional ou teste em aparelho físico. Dockerfiles/Compose foram revisados, mas a imagem completa não foi construída localmente. Os testes não comprovam funcionamento universal em tela bloqueada, Doze, todos os fabricantes, consumo de bateria ou prazo de atendimento. A matriz em acceptance.md permanece necessária antes do atendimento real.
