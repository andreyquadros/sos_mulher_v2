# Lume Navegador Android

Flutter3.41.6 + Kotlin nativo. Ícone/nome discretos com consentimento explícito na área reservada. Só envia posição e áudio durante ocorrência. Veja [contrato](../../docs/api-contract.md) e [camada Android](android/README.md).

```sh
flutter pub get
flutter analyze
flutter test
flutter build apk --debug --split-per-abi
```

Para avaliar com API demo local, no emulador use `http://10.0.2.2:3001`; no aparelho USB, `adb reverse tcp:3001 tcp:3001` e `http://127.0.0.1:3001`. O debug limita HTTP a esses endereços. A assinatura institucional e HTTPS são obrigatórios no release; modelo em android/key.properties.example. Nunca usar APK debug para atendimento real.

Na interface: Área reservada → credencial de bloqueio do próprio aparelho → código gerado pela central → consentimento → permissões → ativar → teste simulado com a equipe. A pressão contínua de 3s permanece na interface e na confirmação genérica da notificação/bloco rápido, sem liberar o keyguard ou mostrar dados pessoais.

O [atalho físico opcional](../../docs/physical-trigger.md) usa somente teclas de volume por um serviço de acessibilidade autorizado pela assistida. Exige configurações Android, treino local de 90s com bloqueio seguro e habilitação real explícita. Sequência: BAIXAR/soltar → SUBIR/soltar → BAIXAR/soltar → SUBIR por 2–4s/soltar; cliques até 1s, intervalos até 1,5s, total até 10s e cooldown de 30s. O chord simultâneo antigo foi removido. Não há leitura de tela, gestos, screenshot ou palavra-chave contínua.

Para usar com bloqueio, acenda a tela com um toque curto em liga/desliga sem desbloquear. Tela apagada, chamadas, outro filtro de acessibilidade e políticas do fabricante podem impedir a entrega das teclas. Reinício/mudança do sistema/novo vínculo exigem novo treino; pausar serviço desabilita o atalho. Encerrar o foreground service exige reativação visível dos sensores: um atalho ainda habilitado pode preservar alerta sem sensores, mas não inicia serviço em segundo plano. Compartilhamento pode ser interrompido localmente sem cancelar a ocorrência policial.

Para o ensaio instrumental, iniciar API demo e emulador; conceder permissões no aparelho de teste e configurar localização fictícia. No root: `npm run prepare:e2e`. Nesta pasta:

```sh
flutter test integration_test/device_flow_test.dart -d emulator-5554 --dart-define-from-file=../../artifacts/e2e-config.json --timeout 180s
```

O teste exige demo, não usa pessoas reais e verifica sensores/arquivos/entrega/encerramento. O código de vínculo é efêmero e a configuração fica fora do Git. O APK do harness não é o APK de avaliação: executar novamente flutter build apk depois do teste.

A máquina física e as políticas têm 25 testes JVM aprovados; Flutter tem 19 testes aprovados. O ensaio de acessibilidade em emulador API34 com PIN de teste passou: treino sob keyguard, alerta em segundo plano, GPS/AAC recebidos e repetição suprimida após pausa. Execute `npm run test:android:physical` no root, com API demo e AVD isolado Google APIs. O driver usa ADB root somente no emulador para enviar eventos ao kernel e restaura ADB normal; o APK continua com UID e permissões normais. Veja a [execução nativa](../../docs/physical-trigger.md#ensaio-instrumental-isolado) e as [evidências](../../docs/validation.md). O resultado não comprova botões físicos de todos os aparelhos.

A área reservada fecha ao colocar o app em segundo plano e sua janela usa FLAG_SECURE. Configure um bloqueio seguro de tela para acessar essa área; o app não solicita nem armazena o PIN em campos próprios. O acesso emergencial genérico não depende de abrir a área privada.
