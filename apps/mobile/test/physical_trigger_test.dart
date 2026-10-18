import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lume_navegador/main.dart';
import 'package:lume_navegador/physical_trigger_card.dart';
import 'package:lume_navegador/protection.dart';

const channel = MethodChannel('physical-trigger-ui-test');

Map<String, Object?> physicalStatus([Map<String, Object?> extra = const {}]) =>
    {
      'paired': true,
      'armed': true,
      'physicalConnected': true,
      'physicalEnabled': false,
      'physicalReady': false,
      'physicalTrainedLocked': false,
      'physicalTraining': 'idle',
      ...extra,
    };

class PhysicalHarness {
  PhysicalHarness(WidgetTester tester, [Map<String, Object?> extra = const {}])
    : native = physicalStatus(extra),
      protection = ProtectionController(channel: channel) {
    protection.status = ProtectionStatus.fromMap(native);
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      calls.add(call);
      if (call.method == 'beginPhysicalTraining') {
        native = {
          ...native,
          'physicalEnabled': false,
          'physicalReady': false,
          'physicalTrainedLocked': false,
          'physicalTraining': 'waiting',
        };
      } else if (call.method == 'cancelPhysicalTraining') {
        native = {...native, 'physicalTraining': 'idle'};
      } else if (call.method == 'enablePhysicalTrigger') {
        native = {...native, 'physicalEnabled': true, 'physicalReady': true};
      } else if (call.method == 'disablePhysicalTrigger') {
        native = {...native, 'physicalEnabled': false, 'physicalReady': false};
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
            child: PhysicalTriggerCard(protection: protection),
          ),
        ),
      ),
    );
  }

  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    protection.dispose();
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      null,
    );
  }

  Future<void> tap(WidgetTester tester, String key) async {
    final control = find.byKey(ValueKey(key));
    await tester.ensureVisible(control);
    await tester.tap(control);
    await tester.pumpAndSettle();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('status físico ausente nunca afirma ativação ou prontidão', () {
    final missing = ProtectionStatus.fromMap({});
    expect(missing.physicalConnected, isFalse);
    expect(missing.physicalConflict, isFalse);
    expect(missing.physicalEnabled, isFalse);
    expect(missing.physicalReady, isFalse);
    expect(missing.physicalTrainedLocked, isFalse);
    expect(missing.physicalTraining, 'idle');
    expect(missing.physicalCooldownSeconds, 0);
    expect(missing.physicalActivationAllowed, isFalse);
    expect(missing.physicalTriggerReady, isFalse);
    final inconsistent = ProtectionStatus.fromMap(
      physicalStatus({'physicalReady': true, 'physicalEnabled': true}),
    );
    expect(inconsistent.physicalTriggerReady, isFalse);
  });

  test(
    'prova bloqueada, conexão, sessão e ausência de conflito são necessárias',
    () {
      final passed = physicalStatus({'physicalTrainedLocked': true});
      expect(
        ProtectionStatus.fromMap(passed).physicalActivationAllowed,
        isTrue,
      );
      for (final missing in [
        {'paired': false},
        {'armed': false},
        {'physicalConnected': false},
        {'physicalConflict': true},
        {'physicalTrainedLocked': false},
        {'physicalTraining': 'waiting'},
        {'physicalTraining': 'unlocked'},
      ]) {
        expect(
          ProtectionStatus.fromMap({
            ...passed,
            ...missing,
          }).physicalActivationAllowed,
          isFalse,
        );
      }
      final ready = ProtectionStatus.fromMap({
        ...passed,
        'physicalEnabled': true,
        'physicalReady': true,
      });
      expect(ready.physicalTriggerReady, isTrue);
      expect(
        ProtectionStatus.fromMap({
          ...passed,
          'physicalEnabled': true,
          'physicalReady': true,
          'physicalConflict': true,
        }).physicalTriggerReady,
        isFalse,
      );
    },
  );

  testWidgets('configurações só abrem após consentimento marcado', (
    tester,
  ) async {
    final h = PhysicalHarness(tester);
    await h.mount(tester);
    await h.tap(tester, 'physical-open-settings');
    expect(h.calls, isEmpty);
    expect(find.textContaining('Não lê textos'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const ValueKey('physical-settings-confirm')),
          )
          .onPressed,
      isNull,
    );
    await h.tap(tester, 'physical-settings-consent');
    await h.tap(tester, 'physical-settings-confirm');
    expect(h.calls.map((c) => c.method), ['physicalSettings']);
    expect(h.calls.single.arguments, {'consent': true});
    await h.close(tester);
  });

  testWidgets('cancelar consentimento não faz chamada nativa', (tester) async {
    final h = PhysicalHarness(tester);
    await h.mount(tester);
    await h.tap(tester, 'physical-open-settings');
    await tester.tap(find.text('Agora não'));
    await tester.pumpAndSettle();
    expect(h.calls, isEmpty);
    await h.tap(tester, 'physical-open-settings');
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const ValueKey('physical-settings-confirm')),
          )
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('Agora não'));
    await tester.pumpAndSettle();
    await h.close(tester);
  });

  testWidgets('treino e cancelamento nunca acionam alerta nem sensores', (
    tester,
  ) async {
    final h = PhysicalHarness(tester, {
      'physicalEnabled': true,
      'physicalReady': true,
      'physicalTrainedLocked': true,
    });
    await h.mount(tester);
    await h.tap(tester, 'physical-begin-training');
    expect(h.calls, isEmpty);
    expect(
      find.textContaining('não envia alertas nem inicia captura'),
      findsOneWidget,
    );
    await h.tap(tester, 'physical-training-confirm');
    expect(h.calls.map((c) => c.method), ['beginPhysicalTraining']);
    expect(h.protection.status.physicalEnabled, isFalse);
    expect(h.protection.status.physicalTraining, 'waiting');
    expect(
      find.byKey(const ValueKey('physical-cancel-training')),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('physical-enable')))
          .onPressed,
      isNull,
    );
    await h.tap(tester, 'physical-cancel-training');
    expect(h.calls.map((c) => c.method), [
      'beginPhysicalTraining',
      'cancelPhysicalTraining',
    ]);
    expect(h.protection.status.physicalTraining, 'idle');
    await h.close(tester);
  });

  testWidgets('prova aprovada não ativa sozinha; ativação exige nova escolha', (
    tester,
  ) async {
    final h = PhysicalHarness(tester, {'physicalTraining': 'waiting'});
    await h.mount(tester);
    h.native = physicalStatus({
      'physicalTrainedLocked': true,
      'physicalTraining': 'passed_locked',
    });
    await h.protection.refresh();
    await tester.pumpAndSettle();
    expect(h.calls.map((c) => c.method), ['status']);
    expect(h.protection.status.physicalEnabled, isFalse);
    await h.tap(tester, 'physical-enable');
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const ValueKey('physical-enable-confirm')),
          )
          .onPressed,
      isNull,
    );
    await h.tap(tester, 'physical-enable-consent');
    await h.tap(tester, 'physical-enable-confirm');
    expect(h.calls.map((c) => c.method), ['status', 'enablePhysicalTrigger']);
    expect(h.calls.last.arguments, {'consent': true});
    expect(h.protection.status.physicalTriggerReady, isTrue);
    await h.close(tester);
  });

  testWidgets('perder a conexão durante consentimento impede ativação', (
    tester,
  ) async {
    final h = PhysicalHarness(tester, {'physicalTrainedLocked': true});
    await h.mount(tester);
    await h.tap(tester, 'physical-enable');
    await h.tap(tester, 'physical-enable-consent');
    h.native = {...h.native, 'physicalConnected': false};
    await h.protection.refresh();
    await tester.pumpAndSettle();
    await h.tap(tester, 'physical-enable-confirm');
    expect(h.calls.map((c) => c.method), ['status']);
    expect(h.protection.status.physicalEnabled, isFalse);
    await h.close(tester);
  });

  testWidgets('conflito orienta alternativa e preserva recursos essenciais', (
    tester,
  ) async {
    final h = PhysicalHarness(tester, {
      'physicalConflict': true,
      'physicalTrainedLocked': true,
      'physicalReady': true,
    });
    await h.mount(tester);
    expect(find.textContaining('Mantenha TalkBack'), findsOneWidget);
    expect(find.textContaining('notificação do Lume'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('physical-enable')))
          .onPressed,
      isNull,
    );
    expect(
      tester
          .widget<OutlinedButton>(
            find.byKey(const ValueKey('physical-begin-training')),
          )
          .onPressed,
      isNull,
    );
    expect(h.calls, isEmpty);
    await h.close(tester);
  });

  testWidgets(
    'atalho ativo sem sessão não afirma localização e pode ser desativado',
    (tester) async {
      final h = PhysicalHarness(tester, {
        'armed': false,
        'physicalEnabled': true,
        'physicalTrainedLocked': true,
        'physicalCooldownSeconds': 18,
      });
      await h.mount(tester);
      expect(find.text('Atalho ativo · reative a sessão'), findsOneWidget);
      expect(
        find.textContaining('Reative a sessão para localização e áudio'),
        findsOneWidget,
      );
      expect(find.textContaining('18 segundo(s)'), findsOneWidget);
      await h.tap(tester, 'physical-disable');
      expect(h.calls.map((c) => c.method), ['disablePhysicalTrigger']);
      expect(h.protection.status.physicalEnabled, isFalse);
      await h.close(tester);
    },
  );

  testWidgets('treino fica indisponível durante ocorrência aberta', (
    tester,
  ) async {
    final h = PhysicalHarness(tester, {'incidentId': 'ficticia'});
    await h.mount(tester);
    expect(
      tester
          .widget<OutlinedButton>(
            find.byKey(const ValueKey('physical-begin-training')),
          )
          .onPressed,
      isNull,
    );
    expect(find.textContaining('Há uma ocorrência aberta'), findsOneWidget);
    expect(h.calls, isEmpty);
    await h.close(tester);
  });

  testWidgets('bloquear fecha também consentimento sobre a área reservada', (
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
      return physicalStatus();
    });
    final c = ProtectionController(channel: channel);
    await tester.pumpWidget(LumeApp(protection: c));
    await tester.pump();
    await tester.tap(find.byTooltip('Área reservada'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('physical-open-settings')),
      450,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.byKey(const ValueKey('physical-open-settings')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('physical-open-settings')));
    await tester.pumpAndSettle();
    expect(find.text('Acessibilidade para teclas de volume'), findsOneWidget);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.text('Acessibilidade para teclas de volume'), findsNothing);
    expect(find.text('Seu cuidado,\nno seu tempo.'), findsNothing);
    expect(find.text('O que vamos\nexplorar?'), findsOneWidget);
    expect(calls, isNot(contains('physicalSettings')));
    expect(calls, isNot(contains('enablePhysicalTrigger')));
    expect(calls, isNot(contains('trigger')));
    await tester.pumpWidget(const SizedBox.shrink());
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      null,
    );
  });
}
