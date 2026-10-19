# Lume Navegador Android

Flutter3.41.6 + Kotlin nativo. Ícone/nome discretos com consentimento explícito na área reservada. Só envia posição e áudio durante ocorrência. Veja [contrato](../../docs/api-contract.md) e [camada Android](android/README.md).

A versão2.2.1 aplica a identidade SOS Mulher V3 exclusivamente na área reservada: emblema com mãos/escudo, paleta marfim/ameixa/turquesa e cartões de consentimento, estado e acionamento. O `Theme` privado não altera o tema do navegador; os diálogos capturam esse contexto local. Ícone Android, splash, nome e página inicial permanecem Lume Navegador. A autenticação de bloqueio, `FLAG_SECURE` e o fechamento dos diálogos/rota ao background foram preservados. Prévias de widgets com estado fictício: [inicial](../../design/previews/mobile-v3/lume-browser.png), [reservada](../../design/previews/mobile-v3/sos-reserved.png).

Dois testes verificam isolamento visual/tema antes e após autenticação, fechamento ao bloquear com diálogo aberto e layout em320px com fonte ampliada. Para regenerar as prévias sem alterar o aplicativo distribuído:

```sh
flutter test test/reserved_identity_test.dart --dart-define=RESERVED_PREVIEW_DIR=../../design/previews/mobile-v3
```

```sh
node ../../scripts/prepare-voice-model.mjs
flutter pub get
flutter analyze
flutter test
flutter build apk --debug --split-per-abi
```

Para avaliar com API demo local, no emulador use `http://10.0.2.2:3001`; no aparelho USB, `adb reverse tcp:3001 tcp:3001` e `http://127.0.0.1:3001`. O debug limita HTTP a esses endereços. A assinatura institucional e HTTPS são obrigatórios no release; modelo em android/key.properties.example. Nunca usar APK debug para atendimento real.

Na interface: Área reservada → credencial de bloqueio do próprio aparelho → código gerado pela central → consentimento → permissões → ativar → teste simulado com a equipe. A pressão contínua de 3s permanece na interface e na confirmação genérica da notificação/bloco rápido, sem liberar o keyguard ou mostrar dados pessoais.

O [atalho físico opcional](../../docs/physical-trigger.md) usa somente teclas de volume por um serviço de acessibilidade autorizado pela assistida. Exige configurações Android, treino local de 90s com bloqueio seguro e habilitação real explícita. Sequência: BAIXAR/soltar → SUBIR/soltar → BAIXAR/soltar → SUBIR por 2–4s/soltar; cliques até 1s, intervalos até 1,5s, total até 10s e cooldown de 30s. Não há leitura de tela, gestos ou screenshot.

O [reconhecimento de frase opcional](../../docs/voice-trigger.md) usa Vosk português offline incorporado ao APK. Exige consentimento de microfone, sessão armada, treino com celular bloqueado e habilitação real separada com app visível. Dizer a frase completa duas vezes, com pausa de 1–2s e dentro de 12s, pode criar o alerta mesmo com a tela apagada. PCM/texto anteriores ao alerta ficam só em memória. A escuta tem notificação/indicador Android, pode ser parada sem desbloqueio e não reinicia sozinha. Não é biometria: outra pessoa ou uma gravação da frase pode acionar. Chamadas, microfone global, bateria e fabricante exigem ensaio real.

Para usar com bloqueio, acenda a tela com um toque curto em liga/desliga sem desbloquear. Tela apagada, chamadas, outro filtro de acessibilidade e políticas do fabricante podem impedir a entrega das teclas. Reinício/mudança do sistema/novo vínculo exigem novo treino; pausar serviço desabilita o atalho. Encerrar o foreground service exige reativação visível dos sensores: um atalho ainda habilitado pode preservar alerta sem sensores, mas não inicia serviço em segundo plano. Compartilhamento pode ser interrompido localmente sem cancelar a ocorrência policial.

Para o ensaio instrumental, iniciar API demo e emulador; conceder permissões no aparelho de teste e configurar localização fictícia. No root: `npm run prepare:e2e`. Nesta pasta:

```sh
flutter test integration_test/device_flow_test.dart -d emulator-5554 --dart-define-from-file=../../artifacts/e2e-config.json --timeout 180s
```

O teste exige demo, não usa pessoas reais e verifica sensores/arquivos/entrega/encerramento. O código de vínculo é efêmero e a configuração fica fora do Git. O APK do harness não é o APK de avaliação: executar novamente flutter build apk depois do teste.

A suíte cobre políticas JVM e consentimento/estado Flutter; veja os números e resultados em [validação](../../docs/validation.md). O ensaio físico usa `npm run test:android:physical` e o da voz usa `npm run test:android:voice`, no root, com API demo e AVD isolado. Somente o driver físico usa ADB root no emulador; o APK mantém UID/permissões normais. O ensaio de voz testa separadamente o microfone real sob keyguard e o decoder com PCM sintético: isso não certifica captação acústica ou fabricantes reais.

A área reservada fecha ao colocar o app em segundo plano e sua janela usa FLAG_SECURE. Configure um bloqueio seguro de tela para acessar essa área; o app não solicita nem armazena o PIN em campos próprios. O acesso emergencial genérico não depende de abrir a área privada.
