# Camada Android do Lume Navegador

`MainActivity` publica o MethodChannel `br.gov.ro.lume/protection`. Todos os métodos devolvem o mapa de estado e alterações emitem `statusChanged`:

- `configure({baseUrl,code,consentLocation:true,consentAudio})`: origem da central sem `/api`; usa o código de uso único. Token e vínculo são cifrados com AES-GCM e chave não exportável do Android Keystore.
- `requestPermissions()`, `arm()`, `disarm()`, `status()`.
- `trigger({trigger:'hold'|'volume'|'notification',simulated:boolean})`: confirma a gravação de um UUID na fila SQLite antes de tentar enviar. Criar alerta independe de GPS, microfone e sessão armada.
- `stopSharing()`: interrompe sensores imediatamente, preserva registros já capturados para reenvio e mantém a ocorrência da central aberta. Uma nova ação explícita `arm` ou `trigger` pode retomar o compartilhamento.
- `authenticateReserved()`: abre a confirmação nativa da credencial do aparelho e devolve o mapa de estado **somente após `RESULT_OK`**. Sem bloqueio seguro, falha com código neutro `device_lock`; cancelamento falha com `authentication_cancelled`. O aplicativo não coleta nem guarda PIN/senha/padrão. Flutter deve aguardar o sucesso antes de abrir a área reservada e sair dela quando for pausado.
- `leaveReserved()`: limpa `FLAG_SECURE` da janela principal ao sair da área reservada e devolve o estado. A janela recebe `FLAG_SECURE` antes da autenticação e mantém a proteção contra captura/preview de recentes durante a área privada. A autenticação não é exigida para acionamento de emergência, volume ou a superfície genérica sobre keyguard.
- `physicalSettings({consent:true})`: com Activity visível e autorização explícita, abre as configurações nativas de acessibilidade; o app não habilita o serviço sozinho.
- `beginPhysicalTraining()`, `cancelPhysicalTraining()`: iniciam/cancelam a janela de treino local de 90s; treino nunca chama o fluxo de ocorrência ou sensores.
- `enablePhysicalTrigger({consent:true})`, `disablePhysicalTrigger()`: habilitação real separada do treino; exige vínculo atual, sessão pronta, serviço de acessibilidade conectado, ausência de conflito e prova de treino com bloqueio seguro.
- `beginVoiceTraining({phraseId,consent:true})`, `cancelVoiceTraining()`, `enableVoiceTrigger({consent:true})`, `disableVoiceTrigger()`: treino de 90s sem envio, duas falas completas sob keyguard e ativação real separada. Início/habilitação exigem Activity resumed, áudio autorizado e sessão existente. A notificação oferece parada sem abrir Activity. O tipo microphone pode ser acrescentado ao serviço existente enquanto a Activity está visível, se a permissão foi concedida depois de armar.

Estado inclui `paired`, `womanName`, `armed`, `incidentId`, `pendingCount`, `failedCount`, `lastError`, `permissionsGranted`, `audioPermissionGranted`, `locationEnabled`, `consentAudio`, `sharingPaused`, `simulated`, `escalationPending`, `incidentStatus`, `receivedAt`, `acknowledgedAt`, `assignedName`. Antes da confirmação do servidor, `incidentId` é o UUID local e `receivedAt` é nulo. Recebimento técnico, reconhecimento humano e atribuição são estados diferentes.

O atalho acrescenta `physicalConnected`, `physicalConflict`, `physicalEnabled`, `physicalReady`, `physicalTrainedLocked`, `physicalTraining` e `physicalCooldownSeconds`. `physicalEnabled` registra a escolha da assistida; `physicalReady` também exige sessão de sensores pronta. Nenhum dos dois representa confirmação da central.

Uma solicitação real durante exercício cria promoção durável com UUID próprio e mantém o UUID base da telemetria. A central promove a mesma ocorrência. O app apaga o reconhecimento/recebimento exibido enquanto a promoção aguarda confirmação; snapshots do exercício anterior não podem confirmar o pedido real.

Erros permanentes de validação (por exemplo 400/413/415) isolam os registros em quarentena cifrada persistente e incrementam `failedCount`; não bloqueiam os envios seguintes nem são descartados silenciosamente. Falha permanente na criação do alerta interrompe sensores, informa `incidentStatus='failed'` e preserva os registros em quarentena. 401 arquiva toda a fila da identidade anterior, remove token e estado ativo e para sensores; novo pareamento é permitido e nunca reaproveita a fila antiga. Quarentena exige revisão da equipe responsável e não é reenviada automaticamente.

## Execução e limites

O serviço é iniciado por Activity visível com os tipos `location` e, quando permitido/consentido, `microphone`. Ficar armado **não** registra atualizações de localização nem abre `MediaRecorder`. A opção de voz abre `AudioRecord` somente após consentimento próprio; PCM16 mono16k e transcrições ficam em memória, sem arquivos/envio anteriores ao alerta. Vosk usa vocabulário completo, finais com confiança/timestamps e duas frases iguais separadas por silêncio; não usa correspondência parcial nem gramática reduzida que force qualquer fala ao código. Um alerta encerra e libera `AudioRecord` antes de iniciar GPS/rede e AAC/M4A de aproximadamente 4s. Os blocos e payloads concluídos são cifrados; o cache privado temporário é descartado após rotação/encerramento.

Sem permissão de microfone, a sessão pode operar com localização e informa a limitação; voz fica indisponível. Sem localização ou permissão de notificação, a sessão de sensores não arma; os demais acionamentos ainda preservam/enviam alerta. O Android apresenta notificação, indicadores de privacidade e controles do sistema. A voz opcional tem treino/consentimento próprios e estado de prontidão; nenhuma captura é reiniciada após reboot/morte do processo. Veja [voz, modelo, estados e limites](../../../docs/voice-trigger.md).

O atalho físico opcional exige consentimento, habilitação pela assistida nas configurações Android, treino de 90s com bloqueio seguro e uma confirmação adicional para habilitar acionamentos reais. A sequência é **BAIXAR e soltar → SUBIR e soltar → BAIXAR e soltar → segurar SUBIR por 2–4s e soltar**. Cliques iniciais duram até 1s, intervalos até 1,5s, janela total de 10s e cooldown de 30s. Só o release final dispara; repetição automática, teclas simultâneas, ordem errada e timeout cancelam. O chord antigo de dois volumes por 3s foi removido. Veja [ativação, limites e ensaio](../../../docs/physical-trigger.md).

`PhysicalTriggerService` solicita apenas filtro de teclas, mantém `isAccessibilityTool=false`, não lê conteúdo/janelas e devolve `false` em `onKeyEvent`, preservando o volume normal. O Android pode entregar volume com outro app aberto ou com keyguard, mas isso depende do estado da tela, chamadas, outro filtro de acessibilidade e fabricante. Para o procedimento treinado, acenda a tela com um toque curto em liga/desliga e mantenha o bloqueio; tela totalmente apagada não tem suporte universal. A prova de treino é invalidada após reboot, mudança do sistema ou novo vínculo e precisa ser refeita. Pausar o serviço com `disarm()` desabilita o atalho.

Notificação e bloco rápido “Lume” continuam abrindo uma superfície genérica com pressão contínua de 3s. Essa Activity usa `setShowWhenLocked(true)` sem dispensar o bloqueio, mostrar dados da assistida ou abrir a área reservada. Ela pode iniciar a sessão de sensores porque está visível. A rota física em segundo plano apenas preserva/envia o alerta e utiliza uma sessão já existente: nunca inicia um novo foreground service. Se a sessão morrer, `physicalReady=false`; um atalho ainda habilitado e com serviço/prova válidos pode preservar um pedido sem sensores, com indicação de degradação e reativação visível necessária. Notificações sobre keyguard também dependem da configuração Android/fabricante.

A fila usa SQLite + JobScheduler com conectividade e backoff exponencial, sem depender do isolate Flutter. A sessão ativa também tenta sincronizar. JobScheduler é eventual, sujeito a Doze/restrições do fabricante: não oferece prazo garantido. Não há confirmação de entrega enquanto o servidor não responde. Áudio pendente é limitado a 40 MiB; pausa a captura ao atingir o limite, preserva alerta/localização e pode retomá-la após drenar metade da fila. Isso não é WebRTC.

`GET /devices/me` detecta resolução e revogação. Resolução encerra sensores e descarta registros que a ocorrência fechada já não aceita. `stopSharing()` preserva a fila existente. Serviço é `START_NOT_STICKY`; morte do processo nunca é apresentada como proteção ativa. Reinício/atualização apenas notifica a necessidade de rearmar e pode drenar a fila: nunca inicia sensores. Uma ocorrência pendente não pode ser desarmada pela UI antes de resolução, mas o compartilhamento sempre pode ser interrompido.

## Distribuição

Nome e ícones originais “Lume Navegador” são os fornecidos em `Mulher-Lume-assets.zip`. Android mínimo é 7.0/API 24, necessário à versão atual do plugin WebView. Release bloqueia HTTP; debug aceita HTTP somente `localhost`, `127.0.0.1` e `10.0.2.2`. Não há trust manager permissivo nem certificados customizados. Backup e transferência de dados estão desabilitados.

Release exige `key.properties` (modelo ao lado) ou `LUME_KEYSTORE_PATH`, `LUME_KEYSTORE_PASSWORD`, `LUME_KEY_ALIAS`, `LUME_KEY_PASSWORD`. Nenhuma chave é criada ou incluída no Git. Debug usa a assinatura local apenas para testes. A instituição deve guardar a chave de distribuição e validar o registro de desenvolvedor/package aplicável à distribuição fora da loja.

## Validação

Prepare o modelo com `node scripts/prepare-voice-model.mjs` no root. Na pasta `apps/mobile/android`, após `flutter pub get` na pasta Flutter:

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

Os testes JVM cobrem políticas de origem/retry/identidade/promoção, máquina física e frase exata com confiança, tempo, repetição e cooldown. Veja os resultados em [validation.md](../../../docs/validation.md). Não substituem ensaios de SQLite/Keystore/permissão/sensores em aparelhos.

Os **32 testes Flutter aprovados** cobrem também consentimento, prontidão, conflito, treino sem ativação automática e fechamento da área reservada durante diálogo. Para voz, `npm run test:android:voice` executa AudioRecord real sob keyguard/tela apagada e, separadamente, decoder Vosk com PCM sintético conhecido. Consulte [o preparo do modelo](../../../docs/voice-model-build.md) e a [matriz de homologação](../../../docs/acceptance.md).

O ensaio `PhysicalTriggerDeviceTest` foi **aprovado: 1/1 AndroidJUnit** em AVD Pixel 3a, Android 14/API34, quatro vCPUs, sem janela e com inicialização a frio. Na execução registrada, o Gradle concluiu em 1min22s e o teste durou aproximadamente 34s. Foram verificados: treino desbloqueado rejeitado; pressão final de 600ms rejeitada; treino sob keyguard seguro aprovado sem ocorrência; habilitação real explícita seguida de sequência em segundo plano/bloqueio com alerta confirmado pela API, localização e AAC; e repetição imediata durante cooldown após `stopSharing()` sem retomar capturas.

Todos os registros foram simulados por imposição da API demo. O microfone do host estava desativado: receber blocos AAC comprova o pipeline no emulador, não captação acústica física ou qualidade de áudio em um telefone. Recebimento da API não confirma atendimento humano, e o ensaio não certifica fabricantes, teclas físicas ou bateria de aparelhos reais.

Com a API local em `DEMO_MODE=true`, execute no root do repositório:

```sh
npm run test:android:physical
```

O procedimento exige exatamente um AVD descartável e isolado, com imagem Google APIs compatível com `adb root`, inicialmente sem PIN/senha/padrão e sem dados reais. O driver Node prepara uma fixture privada com permissão `0600`, usa `adb root` exclusivamente nesse ambiente e descobre automaticamente o nó `/dev/input/event*` do teclado nomeado pelo AVD. Envia `sendevent` com `EV_KEY` 114/115 (BAIXAR/SUBIR) e `EV_SYN`/`SYN_REPORT`, percorrendo o InputReader e o filtro normal de acessibilidade. O AndroidJUnit configura seu PIN de teste e verifica keyguard, treino, alerta, localização e AAC. O driver restaura `adb unroot` na limpeza; **o APK executa com UID normal, sem exigir root em produção**.

A tentativa anterior com `UiAutomation.injectInputEvent` não entregou teclas ao filtro global; o console `event send` do emulador antigo respondeu `OK` sem produzir eventos observáveis por `getevent`. O driver atual não depende desses mecanismos. As flags de teste não chamam o callback produtivo, não concedem root ao APK e não criam um atalho no código de produção. Não substitua o driver por injeção direta no callback ou pelo comando Gradle isolado.

Preparação, restrições e limpeza estão em [physical-trigger.md](../../../docs/physical-trigger.md#ensaio-instrumental-isolado); resultados em [validation.md](../../../docs/validation.md). Os fluxos de confirmação de credencial da área reservada e proteção de recentes/screenshot continuam exigindo ensaio específico: o teste do atalho sob keyguard seguro não os certifica. A homologação deve verificar entrada correta, credencial errada/cancelada, ausência de bloqueio seguro e retorno do segundo plano, além de confirmar que emergências continuam disponíveis sem essa autenticação.

Antes de operação institucional, executar em aparelhos físicos Android 12–16, Samsung/Motorola e fabricantes de política de bateria distinta:

1. Vincular com mulher fictícia; negar microfone e usar localização aproximada; alertar e confirmar limitação no painel.
2. Armar sem alertar por 5 minutos: nenhum ponto/áudio chega e nenhum arquivo de gravação existe.
3. Acionar: uma única ocorrência; localização com precisão/horário e blocos reproduzíveis após confirmação do servidor.
4. Tela bloqueada, app em outro aplicativo, troca Wi-Fi/4G e cinco minutos offline: fila persiste, identidade de evento não duplica e confirmações permanecem honestas.
5. Interromper compartilhamento: nenhum sensor continua coletando; fila antiga drena, central permanece com ocorrência aberta; retomar só por nova ação explícita.
6. Resolver na central: sensores param; revogar token: sessão para e não aparece armada. Testar disputa de entrega/resolução.
7. Remover dos recentes, matar processo, reiniciar e atualizar APK: verificar estado real, rearmamento necessário e preservação da fila. O encerramento pelo gerenciador Android pode matar o processo sem callback.
8. Habilitar acessibilidade apenas após consentimento; treino desbloqueado não aprova; treino completo com bloqueio seguro não cria ocorrência. Depois de habilitar o modo real, testar sequência deliberada, release, cooldown e retorno de outro app. Volume normal, repetições, pressão longa acima de 4s, tecla concorrente e ordem errada não disparam. Ensaiar chamadas, outro filtro de acessibilidade e conflitos do fabricante.
9. Testar Doze com `adb shell dumpsys deviceidle force-idle`; restaurar com `adb shell dumpsys deviceidle unforce` e `adb shell dumpsys battery reset`. Medir latência, bateria, interrupção por chamada telefônica, botão global de microfone e armazenamento cheio.
10. APK release sem chave deve falhar; APK assinado institucionalmente deve atualizar apenas instalação com assinatura compatível.

Fontes de plataforma: [tipos de foreground service](https://developer.android.com/develop/background-work/services/fgs/service-types), [restrições de início](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [Doze](https://developer.android.com/training/monitoring-device-state/doze-standby), [encerramento pelo usuário](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping), [assinatura](https://developer.android.com/studio/publish/app-signing), [verificação de desenvolvedor](https://developer.android.com/developer-verification).
