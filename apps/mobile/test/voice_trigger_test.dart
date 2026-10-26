import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lume_navegador/main.dart';
import 'package:lume_navegador/protection.dart';
import 'package:lume_navegador/voice_trigger_card.dart';

const channel = MethodChannel('voice-trigger-ui-test');

Map<String, Object?> voiceStatus([Map<String, Object?> extra = const {}]) => {
  'paired': true,
  'armed': true,
  'permissionsGranted': true,
  'consentAudio': true,
  'voiceAvailable': true,
  'voiceEnabled': false,
  'voiceListening': false,
  'voiceReady': false,
  'voiceTrainedLocked': false,
  'voiceTraining': 'idle',
  'voicePhraseId': 'estrela_azul',
  ...extra,
};

class VoiceHarness {
  VoiceHarness(WidgetTester tester, [Map<String, Object?> extra = const {}])
    : native = voiceStatus(extra),
      protection = ProtectionController(channel: channel) {
    protection.status = ProtectionStatus.fromMap(native);
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      calls.add(call);
      if (call.method == 'beginVoiceTraining') {
        native = {
          ...native,
          'voicePhraseId': (call.arguments as Map)['phraseId'],
          'voiceEnabled': false,
          'voiceReady': false,
          'voiceTrainedLocked': false,
          'voiceTraining': 'waiting',
          'voiceListening': true,
        };
      } else if (call.method == 'cancelVoiceTraining') {
        native = {...native, 'voiceTraining': 'idle', 'voiceListening': false};
      } else if (call.method == 'enableVoiceTrigger') {
        native = {
          ...native,
          'voiceEnabled': true,
          'voiceListening': true,
          'voiceReady': true,
        };
      } else if (call.method == 'disableVoiceTrigger') {
        native = {
          ...native,
          'voiceEnabled': false,
          'voiceListening': false,
          'voiceReady': false,
        };
      }
      return native;
    });
  }

  final ProtectionController protection;
  final List<MethodCall> calls = [];
  Map<String, Object?> native;

  Future<void> mount(WidgetTester tester) async {
    tester.view.physicalSize = const Size(600, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: VoiceTriggerCard(protection: protection),
          ),
        ),
      ),
    );
  }

  Future<void> tap(WidgetTester tester, String key) async {
    final control = find.byKey(ValueKey(key));
    await tester.ensureVisible(control);
    await tester.tap(control);
    await tester.pumpAndSettle();
  }

  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    protection.dispose();
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      null,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('campos de voz ausentes não afirmam escuta nem prontidão', () {
    final missing = ProtectionStatus.fromMap({});
    expect(missing.voiceAvailable, isFalse);
    expect(missing.voiceEnabled, isFalse);
    expect(missing.voiceListening, isFalse);
    expect(missing.voiceReady, isFalse);
    expect(missing.voiceTrainedLocked, isFalse);
    expect(missing.voiceTraining, 'idle');
    expect(missing.voicePhraseId, 'estrela_azul');
    expect(missing.voiceConfirmationPending, isFalse);
    expect(missing.voiceCooldownSeconds, 0);
    expect(missing.voiceError, isNull);
    expect(missing.voiceActivationAllowed, isFalse);
    expect(missing.voiceTriggerReady, isFalse);
  });

  test(
    'voz exige sessão, consentimento, permissão, modelo e prova bloqueada',
    () {
      final passed = voiceStatus({'voiceTrainedLocked': true});
      expect(ProtectionStatus.fromMap(passed).voiceActivationAllowed, isTrue);
      for (final missing in [
        {'paired': false},
        {'armed': false},
        {'permissionsGranted': false},
        {'consentAudio': false},
        {'sharingPaused': true},
        {'voiceAvailable': false},
        {'voiceTrainedLocked': false},
        {'voiceTraining': 'loading'},
        {'voiceTraining': 'waiting'},
        {'voiceTraining': 'unlocked'},
        {'physicalTraining': 'waiting'},
        {'incidentId': 'ficticia'},
      ]) {
        expect(
          ProtectionStatus.fromMap({
            ...passed,
            ...missing,
          }).voiceActivationAllowed,
          isFalse,
          reason: '$missing',
        );
      }
    },
  );

  test(
    'prontidão requer captura efetiva e não admite erro ou treino ativo',
    () {
      final ready = voiceStatus({
        'voiceEnabled': true,
        'voiceReady': true,
        'voiceListening': true,
        'voiceTrainedLocked': true,
      });
      expect(ProtectionStatus.fromMap(ready).voiceTriggerReady, isTrue);
      for (final missing in [
        {'voiceEnabled': false},
        {'voiceListening': false},
        {'voiceReady': false},
        {'voiceTrainedLocked': false},
        {'voiceTraining': 'loading'},
        {'voiceError': 'Microfone indisponível.'},
        {'incidentId': 'ficticia'},
      ]) {
        expect(
          ProtectionStatus.fromMap({...ready, ...missing}).voiceTriggerReady,
          isFalse,
          reason: '$missing',
        );
      }
      expect(
        ProtectionStatus.fromMap({
          'voiceCooldownSeconds': 200,
        }).voiceCooldownSeconds,
        30,
      );
      expect(
        ProtectionStatus.fromMap({
          'voiceCooldownSeconds': -1,
        }).voiceCooldownSeconds,
        0,
      );
    },
  );

  testWidgets('modelo ausente mantém treino e ativação indisponíveis', (
    tester,
  ) async {
    final h = VoiceHarness(tester, {'voiceAvailable': false});
    await h.mount(tester);
    expect(find.text('Reconhecimento offline indisponível'), findsOneWidget);
    expect(
      tester
          .widget<OutlinedButton>(
            find.byKey(const ValueKey('voice-begin-training')),
          )
          .onPressed,
      isNull,
    );
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('voice-enable')))
          .onPressed,
      isNull,
    );
    expect(h.calls, isEmpty);
    await h.close(tester);
  });

  testWidgets(
    'treino usa só a frase escolhida e exige consentimento do microfone',
    (tester) async {
      final h = VoiceHarness(tester);
      await h.mount(tester);
      await tester.tap(find.byKey(const ValueKey('voice-phrase-estrela_azul')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('o jardim precisa de luz').last);
      await tester.pumpAndSettle();
      await h.tap(tester, 'voice-begin-training');
      expect(h.calls, isEmpty);
      expect(
        find.textContaining('sem enviar alertas ou áudio à central'),
        findsOneWidget,
      );
      expect(find.textContaining('“o jardim precisa de luz”'), findsWidgets);
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const ValueKey('voice-training-confirm')),
            )
            .onPressed,
        isNull,
      );
      await h.tap(tester, 'voice-training-consent');
      await h.tap(tester, 'voice-training-confirm');
      expect(h.calls.map((c) => c.method), ['beginVoiceTraining']);
      expect(h.calls.single.arguments, {
        'phraseId': 'jardim_luz',
        'consent': true,
      });
      expect(h.protection.status.voiceTrainingActive, isTrue);
      expect(h.protection.status.voiceEnabled, isFalse);
      expect(h.protection.status.voiceTriggerReady, isFalse);
      await h.tap(tester, 'voice-cancel-training');
      expect(h.calls.map((c) => c.method), [
        'beginVoiceTraining',
        'cancelVoiceTraining',
      ]);
      expect(h.protection.status.voiceListening, isFalse);
      expect(h.protection.status.hasIncident, isFalse);
      await h.close(tester);
    },
  );

  testWidgets('cancelar treino não abre o microfone e reinicia checkbox', (
    tester,
  ) async {
    final h = VoiceHarness(tester);
    await h.mount(tester);
    await h.tap(tester, 'voice-begin-training');
    await h.tap(tester, 'voice-training-consent');
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(h.calls, isEmpty);
    await h.tap(tester, 'voice-begin-training');
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const ValueKey('voice-training-confirm')),
          )
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    await h.close(tester);
  });

  testWidgets(
    'treino aprovado não liga escuta; ativação é outra escolha explícita',
    (tester) async {
      final h = VoiceHarness(tester, {
        'voiceTraining': 'waiting',
        'voiceListening': true,
      });
      await h.mount(tester);
      h.native = voiceStatus({
        'voiceTrainedLocked': true,
        'voiceTraining': 'passed_locked',
      });
      await h.protection.refresh();
      await tester.pumpAndSettle();
      expect(h.calls.map((c) => c.method), ['status']);
      expect(h.protection.status.voiceEnabled, isFalse);
      expect(
        find.text('Treino aprovado · ativação real pendente'),
        findsOneWidget,
      );
      await h.tap(tester, 'voice-enable');
      expect(
        find.textContaining('não a identidade de quem fala'),
        findsOneWidget,
      );
      expect(
        find.textContaining('microfone ficará em uso contínuo'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const ValueKey('voice-enable-confirm')),
            )
            .onPressed,
        isNull,
      );
      await h.tap(tester, 'voice-enable-consent');
      await h.tap(tester, 'voice-enable-confirm');
      expect(h.calls.map((c) => c.method), ['status', 'enableVoiceTrigger']);
      expect(h.calls.last.arguments, {'consent': true});
      expect(h.protection.status.voiceTriggerReady, isTrue);
      await h.close(tester);
    },
  );

  testWidgets('trocar frase exige novo treino e não envia comando', (
    tester,
  ) async {
    final h = VoiceHarness(tester, {'voiceTrainedLocked': true});
    await h.mount(tester);
    await tester.tap(find.byKey(const ValueKey('voice-phrase-estrela_azul')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('a janela da lua').last);
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('voice-enable')))
          .onPressed,
      isNull,
    );
    expect(
      find.textContaining('Pendente · bloqueie o celular'),
      findsOneWidget,
    );
    expect(h.calls, isEmpty);
    await h.close(tester);
  });

  testWidgets('perder sessão durante consentimento impede ativação', (
    tester,
  ) async {
    final h = VoiceHarness(tester, {'voiceTrainedLocked': true});
    await h.mount(tester);
    await h.tap(tester, 'voice-enable');
    await h.tap(tester, 'voice-enable-consent');
    h.native = {...h.native, 'armed': false};
    await h.protection.refresh();
    await tester.pumpAndSettle();
    await h.tap(tester, 'voice-enable-confirm');
    expect(h.calls.map((c) => c.method), ['status']);
    expect(h.protection.status.voiceEnabled, isFalse);
    await h.close(tester);
  });

  testWidgets('perder consentimento durante diálogo impede iniciar treino', (
    tester,
  ) async {
    final h = VoiceHarness(tester);
    await h.mount(tester);
    await h.tap(tester, 'voice-begin-training');
    await h.tap(tester, 'voice-training-consent');
    h.native = {...h.native, 'consentAudio': false};
    await h.protection.refresh();
    await tester.pumpAndSettle();
    await h.tap(tester, 'voice-training-confirm');
    expect(h.calls.map((c) => c.method), ['status']);
    expect(h.protection.status.voiceListening, isFalse);
    await h.close(tester);
  });

  testWidgets('falha de captura não afirma prontidão e permite desativar', (
    tester,
  ) async {
    final h = VoiceHarness(tester, {
      'voiceEnabled': true,
      'voiceTrainedLocked': true,
      'voiceListening': false,
      'voiceReady': true,
      'voiceError': 'Microfone indisponível. Abra o app para revisar.',
    });
    await h.mount(tester);
    expect(find.text('Escuta indisponível · revise o recurso'), findsOneWidget);
    expect(find.text('Escuta local ativa para alerta real'), findsNothing);
    await h.tap(tester, 'voice-disable');
    expect(h.calls.map((c) => c.method), ['disableVoiceTrigger']);
    expect(h.protection.status.voiceEnabled, isFalse);
    await h.close(tester);
  });

  testWidgets(
    'confirmação e intervalo são estados sem chamada de alerta pela UI',
    (tester) async {
      final h = VoiceHarness(tester, {
        'voiceEnabled': true,
        'voiceListening': true,
        'voiceReady': true,
        'voiceTrainedLocked': true,
        'voiceConfirmationPending': true,
      });
      await h.mount(tester);
      expect(
        find.text('Primeira frase reconhecida · aguardando repetição'),
        findsOneWidget,
      );
      expect(h.calls, isEmpty);
      h.native = {
        ...h.native,
        'voiceCooldownSeconds': 22,
        'voiceConfirmationPending': false,
      };
      await h.protection.refresh();
      await tester.pumpAndSettle();
      expect(find.textContaining('22 segundo(s)'), findsOneWidget);
      expect(h.calls.map((c) => c.method), ['status']);
      await h.close(tester);
    },
  );

  testWidgets('bloquear fecha consentimento de voz sem ativar microfone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(600, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final calls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      calls.add(call.method);
      return voiceStatus({'voiceTrainedLocked': true});
    });
    final c = ProtectionController(channel: channel);
    await tester.pumpWidget(LumeApp(protection: c));
    await tester.pump();
    await tester.tap(find.byTooltip('Área reservada'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('optional-trigger-options')),
      450,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Outros atalhos opcionais'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('voice-enable')),
      450,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('voice-enable')));
    await tester.tap(find.byKey(const ValueKey('voice-enable')));
    await tester.pumpAndSettle();
    expect(find.text('Ativar acionamento real por frase?'), findsOneWidget);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('Ativar acionamento real por frase?'), findsNothing);
    expect(find.text('Seu cuidado,\nno seu tempo.'), findsNothing);
    expect(find.text('O que vamos\nexplorar?'), findsOneWidget);
    expect(calls, isNot(contains('enableVoiceTrigger')));
    expect(calls, isNot(contains('beginVoiceTraining')));
    expect(calls, isNot(contains('trigger')));
    await tester.pumpWidget(const SizedBox.shrink());
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      null,
    );
  });
}
