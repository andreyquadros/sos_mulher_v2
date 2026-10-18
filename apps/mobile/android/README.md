# Camada Android do Lume Navegador

`MainActivity` publica o MethodChannel `br.gov.ro.lume/protection`. Todos os métodos devolvem o mapa de estado e alterações emitem `statusChanged`:

- `configure({baseUrl,code,consentLocation:true,consentAudio})`: origem da central sem `/api`; usa o código de uso único. Token e vínculo são cifrados com AES-GCM e chave não exportável do Android Keystore.
- `requestPermissions()`, `arm()`, `disarm()`, `status()`.
- `trigger({trigger:'hold'|'volume'|'notification',simulated:boolean})`: confirma a gravação de um UUID na fila SQLite antes de tentar enviar. Criar alerta independe de GPS, microfone e sessão armada.
- `stopSharing()`: interrompe sensores imediatamente, preserva registros já capturados para reenvio e mantém a ocorrência da central aberta. Uma nova ação explícita `arm` ou `trigger` pode retomar o compartilhamento.
- `authenticateReserved()`: abre a confirmação nativa da credencial do aparelho e devolve o mapa de estado **somente após `RESULT_OK`**. Sem bloqueio seguro, falha com código neutro `device_lock`; cancelamento falha com `authentication_cancelled`. O aplicativo não coleta nem guarda PIN/senha/padrão. Flutter deve aguardar o sucesso antes de abrir a área reservada e sair dela quando for pausado.
- `leaveReserved()`: limpa `FLAG_SECURE` da janela principal ao sair da área reservada e devolve o estado. A janela recebe `FLAG_SECURE` antes da autenticação e mantém a proteção contra captura/preview de recentes durante a área privada. A autenticação não é exigida para acionamento de emergência, volume ou a superfície genérica sobre keyguard.

Estado inclui `paired`, `womanName`, `armed`, `incidentId`, `pendingCount`, `failedCount`, `lastError`, `permissionsGranted`, `audioPermissionGranted`, `locationEnabled`, `consentAudio`, `sharingPaused`, `simulated`, `escalationPending`, `incidentStatus`, `receivedAt`, `acknowledgedAt`, `assignedName`. Antes da confirmação do servidor, `incidentId` é o UUID local e `receivedAt` é nulo. Recebimento técnico, reconhecimento humano e atribuição são estados diferentes.

Uma solicitação real durante exercício cria promoção durável com UUID próprio e mantém o UUID base da telemetria. A central promove a mesma ocorrência. O app apaga o reconhecimento/recebimento exibido enquanto a promoção aguarda confirmação; snapshots do exercício anterior não podem confirmar o pedido real.

Erros permanentes de validação (por exemplo 400/413/415) isolam os registros em quarentena cifrada persistente e incrementam `failedCount`; não bloqueiam os envios seguintes nem são descartados silenciosamente. Falha permanente na criação do alerta interrompe sensores, informa `incidentStatus='failed'` e preserva os registros em quarentena. 401 arquiva toda a fila da identidade anterior, remove token e estado ativo e para sensores; novo pareamento é permitido e nunca reaproveita a fila antiga. Quarentena exige revisão da equipe responsável e não é reenviada automaticamente.

## Execução e limites

O serviço é iniciado por Activity visível com os tipos `location` e, quando permitido/consentido, `microphone`. Ficar armado **não** registra atualizações de localização nem abre `MediaRecorder`. Apenas uma ocorrência inicia GPS/rede e blocos AAC/M4A independentes de aproximadamente 4 segundos. Os blocos concluídos e os payloads da fila são cifrados. O arquivo temporário ainda em gravação usa o cache privado e é removido após rotação/encerramento; não há promessa de recuperar o bloco incompleto de um processo morto.

Sem permissão de microfone, a sessão pode operar com localização e informa a limitação. Sem localização ou permissão de notificação, a sessão de sensores não arma; o alerta ainda é preservado/enviado. O Android apresenta notificação de serviço, indicadores de privacidade e controles do sistema. Não há captura oculta, bypass de permissões, acessibilidade, gravação remota ou palavra-chave sempre ouvindo.

VOL+ e VOL− simultâneos por 3 segundos só são observados com a **Activity do app visível e focada**. Em outros apps, use a ação da notificação ou adicione o bloco “Lume” aos ajustes rápidos: ambos abrem uma superfície genérica que exige pressão contínua de 3 segundos. Essa Activity usa `setShowWhenLocked(true)` e pode aparecer sobre a tela bloqueada, sem dispensar o bloqueio, mostrar dados da assistida ou abrir o navegador/área reservada. O serviço é iniciado pela Activity visível após preservar o alerta. Ao fechar, a tela de bloqueio permanece. A disponibilidade da notificação/ação sobre keyguard depende da configuração da usuária e do fabricante: não há garantia universal nem widget de lockscreen ou atalho físico global. Dados e configurações exigem desbloqueio normal.

A fila usa SQLite + JobScheduler com conectividade e backoff exponencial, sem depender do isolate Flutter. A sessão ativa também tenta sincronizar. JobScheduler é eventual, sujeito a Doze/restrições do fabricante: não oferece prazo garantido. Não há confirmação de entrega enquanto o servidor não responde. Áudio pendente é limitado a 40 MiB; pausa a captura ao atingir o limite, preserva alerta/localização e pode retomá-la após drenar metade da fila. Isso não é WebRTC.

`GET /devices/me` detecta resolução e revogação. Resolução encerra sensores e descarta registros que a ocorrência fechada já não aceita. `stopSharing()` preserva a fila existente. Serviço é `START_NOT_STICKY`; morte do processo nunca é apresentada como proteção ativa. Reinício/atualização apenas notifica a necessidade de rearmar e pode drenar a fila: nunca inicia sensores. Uma ocorrência pendente não pode ser desarmada pela UI antes de resolução, mas o compartilhamento sempre pode ser interrompido.

## Distribuição

Nome e ícones originais “Lume Navegador” são os fornecidos em `Mulher-Lume-assets.zip`. Android mínimo é 7.0/API 24, necessário à versão atual do plugin WebView. Release bloqueia HTTP; debug aceita HTTP somente `localhost`, `127.0.0.1` e `10.0.2.2`. Não há trust manager permissivo nem certificados customizados. Backup e transferência de dados estão desabilitados.

Release exige `key.properties` (modelo ao lado) ou `LUME_KEYSTORE_PATH`, `LUME_KEYSTORE_PASSWORD`, `LUME_KEY_ALIAS`, `LUME_KEY_PASSWORD`. Nenhuma chave é criada ou incluída no Git. Debug usa a assinatura local apenas para testes. A instituição deve guardar a chave de distribuição e validar o registro de desenvolvedor/package aplicável à distribuição fora da loja.

## Validação

Na pasta `apps/mobile/android`, após `flutter pub get` na pasta Flutter:

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

Os oito testes JVM cobrem validação da origem HTTPS, restrição de HTTP de debug, crescimento/limite dos retries, classificação de rejeições permanentes, política de identidade de sessão, decisão de promoção teste→real e tempo, cancelamento e unicidade do chord físico. Não substituem ensaios de SQLite/Keystore/permissão/sensores em aparelhos.

A confirmação de credencial e os previews protegidos da área reservada ainda **não foram validados em emulador/aparelho com bloqueio seguro configurado** nesta entrega. A homologação deve verificar entrada correta, credencial errada/cancelada, ausência de bloqueio seguro, retorno de segundo plano e recentes/screenshot; confirmar também que os acionamentos de emergência continuam disponíveis sem essa autenticação.

Antes de operação institucional, executar em aparelhos físicos Android 12–16, Samsung/Motorola e fabricantes de política de bateria distinta:

1. Vincular com mulher fictícia; negar microfone e usar localização aproximada; alertar e confirmar limitação no painel.
2. Armar sem alertar por 5 minutos: nenhum ponto/áudio chega e nenhum arquivo de gravação existe.
3. Acionar: uma única ocorrência; localização com precisão/horário e blocos reproduzíveis após confirmação do servidor.
4. Tela bloqueada, app em outro aplicativo, troca Wi-Fi/4G e cinco minutos offline: fila persiste, identidade de evento não duplica e confirmações permanecem honestas.
5. Interromper compartilhamento: nenhum sensor continua coletando; fila antiga drena, central permanece com ocorrência aberta; retomar só por nova ação explícita.
6. Resolver na central: sensores param; revogar token: sessão para e não aparece armada. Testar disputa de entrega/resolução.
7. Remover dos recentes, matar processo, reiniciar e atualizar APK: verificar estado real, rearmamento necessário e preservação da fila. O encerramento pelo gerenciador Android pode matar o processo sem callback.
8. Volume isolado, repetições automáticas e perda de foco não disparam; dois botões por 3s disparam uma vez somente na Activity focada. Conferir conflitos de atalho do fabricante.
9. Testar Doze com `adb shell dumpsys deviceidle force-idle`; restaurar com `adb shell dumpsys deviceidle unforce` e `adb shell dumpsys battery reset`. Medir latência, bateria, interrupção por chamada telefônica, botão global de microfone e armazenamento cheio.
10. APK release sem chave deve falhar; APK assinado institucionalmente deve atualizar apenas instalação com assinatura compatível.

Fontes de plataforma: [tipos de foreground service](https://developer.android.com/develop/background-work/services/fgs/service-types), [restrições de início](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [Doze](https://developer.android.com/training/monitoring-device-state/doze-standby), [encerramento pelo usuário](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping), [assinatura](https://developer.android.com/studio/publish/app-signing), [verificação de desenvolvedor](https://developer.android.com/developer-verification).
