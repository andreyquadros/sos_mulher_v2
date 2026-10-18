# Lume Navegador Android

Flutter3.41.6 + Kotlin nativo. Ícone/nome discretos com consentimento explícito na área reservada. Só envia posição e áudio durante ocorrência. Veja [contrato](../../docs/api-contract.md) e [camada Android](android/README.md).

```sh
flutter pub get
flutter analyze
flutter test
flutter build apk --debug --split-per-abi
```

Para avaliar com API demo local, no emulador use `http://10.0.2.2:3001`; no aparelho USB, `adb reverse tcp:3001 tcp:3001` e `http://127.0.0.1:3001`. O debug limita HTTP a esses endereços. A assinatura institucional e HTTPS são obrigatórios no release; modelo em android/key.properties.example. Nunca usar APK debug para atendimento real.

Na interface: Área reservada → código gerado pela central → consentimento → permissões → ativar → teste simulado com a equipe. Pressão contínua3s evita toque acidental; volume só na Activity focada. Notificação/bloco rápido abre confirmação genérica sobre keyguard, sujeita à configuração do Android/fabricante, sem liberar o aparelho nem mostrar dados pessoais. Encerrar processo exige reativação; compartilhar pode ser interrompido localmente sem cancelar a ocorrência policial.

Para o ensaio instrumental, iniciar API demo e emulador; conceder permissões no aparelho de teste e configurar localização fictícia. No root: `npm run prepare:e2e`. Nesta pasta:

```sh
flutter test integration_test/device_flow_test.dart -d emulator-5554 --dart-define-from-file=../../artifacts/e2e-config.json --timeout 180s
```

O teste exige demo, não usa pessoas reais e verifica sensores/arquivos/entrega/encerramento. O código de vínculo é efêmero e a configuração fica fora do Git. O APK do harness não é o APK de avaliação: executar novamente flutter build apk depois do teste.
