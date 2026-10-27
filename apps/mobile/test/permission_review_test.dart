import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lume_navegador/main.dart';
import 'package:lume_navegador/permission_review.dart';
import 'package:lume_navegador/protection.dart';
import 'package:lume_navegador/reserved.dart';

const channel = MethodChannel('permission-review-test');

Map<String, Object?> permissionState({
  String location = 'granted',
  String microphone = 'granted',
  String notifications = 'granted',
  bool gps = true,
  bool canRequest = false,
  bool needsSettings = false,
}) => {
  'paired': true,
  'armed': false,
  'permissionsGranted': !canRequest && !needsSettings,
  'permissionDetails': {
    'location': location,
    'preciseLocation': true,
    'microphone': microphone,
    'notifications': notifications,
    'gpsEnabled': gps,
    'canRequest': canRequest,
    'needsAppSettings': needsSettings,
  },
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Map<String, Object?> state;
  late List<MethodCall> calls;

  setUp(() {
    state = permissionState();
    calls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          if (call.method == 'claimProtectionGuide') {
            return {'show': false, 'visit': 4};
          }
          return state;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  Future<ProtectionController> mount(WidgetTester tester) async {
    final c = ProtectionController(channel: channel)
      ..status = ProtectionStatus.fromMap(state);
    await tester.pumpWidget(MaterialApp(home: ReservedPage(protection: c)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Revisar permissões'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(find.text('Revisar permissões'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Revisar permissões'));
    await tester.pumpAndSettle();
    expect(find.byType(PermissionReview), findsOneWidget);
    return c;
  }

  Future<void> finish(WidgetTester tester, ProtectionController c) async {
    await tester.pumpWidget(const SizedBox.shrink());
    c.dispose();
  }

  testWidgets('todas concedidas abre explicação sem solicitar nem ativar', (
    tester,
  ) async {
    final c = await mount(tester);
    expect(
      find.textContaining('As permissões necessárias já estão concedidas'),
      findsOneWidget,
    );
    expect(find.text('Localização'), findsOneWidget);
    expect(find.text('Áudio durante ocorrência'), findsOneWidget);
    expect(find.text('Notificações'), findsOneWidget);
    expect(find.text('Ligada'), findsOneWidget);
    expect(
      find.textContaining('permissão separada de exibição'),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('permission-request-missing')),
      findsNothing,
    );
    expect(
      calls.map((call) => call.method),
      everyElement(isIn(['status', 'claimProtectionGuide'])),
    );
    await tester.tap(find.byKey(const ValueKey('permission-review-close')));
    await tester.pumpAndSettle();
    expect(find.byType(PermissionReview), findsNothing);
    expect(find.byType(ReservedPage), findsOneWidget);
    await finish(tester, c);
  });

  testWidgets(
    'faltantes só pedidas após toque; áudio não consentido fica fora',
    (tester) async {
      state = permissionState(
        microphone: 'notRequired',
        notifications: 'request',
        canRequest: true,
      );
      final c = await mount(tester);
      expect(find.text('Não solicitada nesta configuração'), findsOneWidget);
      expect(find.text('Falta autorizar'), findsOneWidget);
      expect(calls.any((call) => call.method == 'requestPermissions'), false);
      state = permissionState(microphone: 'notRequired');
      await tester.ensureVisible(
        find.byKey(const ValueKey('permission-request-missing')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('permission-request-missing')),
      );
      await tester.pumpAndSettle();
      expect(
        calls.where((call) => call.method == 'requestPermissions').length,
        1,
      );
      expect(
        find.byKey(const ValueKey('permission-request-missing')),
        findsNothing,
      );
      expect(find.textContaining('já estão concedidas'), findsOneWidget);
      expect(
        calls.any(
          (call) => ['arm', 'trigger', 'openAppSettings'].contains(call.method),
        ),
        false,
      );
      await finish(tester, c);
    },
  );

  testWidgets('negação fixa oferece ajustes sem repetir solicitação Android', (
    tester,
  ) async {
    state = permissionState(notifications: 'settings', needsSettings: true);
    final c = await mount(tester);
    expect(find.text('Revisar nos ajustes do Android'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('permission-request-missing')),
      findsNothing,
    );
    expect(calls.any((call) => call.method == 'openAppSettings'), false);
    await tester.ensureVisible(
      find.byKey(const ValueKey('permission-app-settings')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('permission-app-settings')));
    await tester.pumpAndSettle();
    final action = calls
        .where((call) => call.method == 'openAppSettings')
        .single;
    expect(action.arguments, {'consent': true});
    expect(calls.any((call) => call.method == 'requestPermissions'), false);
    await finish(tester, c);
  });

  testWidgets('GPS desligado só abre ajuste após escolha explícita', (
    tester,
  ) async {
    state = permissionState(gps: false);
    final c = await mount(tester);
    expect(find.text('Desligada · abra os ajustes para ligar'), findsOneWidget);
    expect(calls.any((call) => call.method == 'openLocationSettings'), false);
    await tester.ensureVisible(
      find.byKey(const ValueKey('permission-location-settings')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('permission-location-settings')),
    );
    await tester.pumpAndSettle();
    final action = calls
        .where((call) => call.method == 'openLocationSettings')
        .single;
    expect(action.arguments, {'consent': true});
    expect(
      calls.any((call) => ['arm', 'trigger'].contains(call.method)),
      false,
    );
    await finish(tester, c);
  });

  testWidgets('ir aos ajustes ou bloquear fecha diálogo e rota privada', (
    tester,
  ) async {
    final c = ProtectionController(channel: channel);
    await tester.pumpWidget(LumeApp(protection: c));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Área reservada'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Revisar permissões'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(find.text('Revisar permissões'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Revisar permissões'));
    await tester.pumpAndSettle();
    expect(find.byType(PermissionReview), findsOneWidget);
    for (final state in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(state);
    }
    await tester.pumpAndSettle();
    expect(find.byType(PermissionReview), findsNothing);
    expect(find.byType(ReservedPage), findsNothing);
    expect(find.text('O que vamos\nexplorar?'), findsOneWidget);
    expect(calls.any((call) => call.method == 'leaveReserved'), true);
    expect(
      calls.any(
        (call) =>
            ['arm', 'trigger', 'requestPermissions'].contains(call.method),
      ),
      false,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'negativa após prompt inativo mantém revisão e permite ajustes explícitos',
    (tester) async {
      state = permissionState(notifications: 'request', canRequest: true);
      final pending = Completer<Object?>();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            calls.add(call);
            if (call.method == 'claimProtectionGuide') {
              return {'show': false, 'visit': 4};
            }
            if (call.method == 'requestPermissions') return pending.future;
            return state;
          });
      final c = await mount(tester);
      await tester.ensureVisible(
        find.byKey(const ValueKey('permission-request-missing')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('permission-request-missing')),
      );
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      state = permissionState(notifications: 'settings', needsSettings: true);
      pending.complete(state);
      await tester.pumpAndSettle();
      expect(find.byType(PermissionReview), findsOneWidget);
      expect(find.text('Revisar nos ajustes do Android'), findsOneWidget);
      expect(calls.any((call) => call.method == 'openAppSettings'), false);
      await tester.ensureVisible(
        find.byKey(const ValueKey('permission-app-settings')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('permission-app-settings')));
      await tester.pumpAndSettle();
      expect(
        calls
            .where((call) => call.method == 'openAppSettings')
            .single
            .arguments,
        {'consent': true},
      );
      expect(
        calls.any(
          (call) =>
              ['authenticateReserved', 'arm', 'trigger'].contains(call.method),
        ),
        false,
      );
      await finish(tester, c);
    },
  );

  testWidgets('agregado concedido não esconde localização faltante', (
    tester,
  ) async {
    state = permissionState(location: 'settings', needsSettings: true)
      ..['permissionsGranted'] = true;
    final c = await mount(tester);
    expect(find.textContaining('já estão concedidas'), findsNothing);
    expect(find.text('Revisar nos ajustes do Android'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('permission-request-missing')),
      findsNothing,
    );
    await finish(tester, c);
  });

  testWidgets('estado incompleto pede atualização sem presumir concessão', (
    tester,
  ) async {
    state = {
      'paired': true,
      'permissionsGranted': true,
      'permissionDetails': {'location': 'invalid'},
    };
    final c = await mount(tester);
    expect(
      find.textContaining('Não foi possível verificar as permissões'),
      findsOneWidget,
    );
    expect(find.textContaining('já estão concedidas'), findsNothing);
    expect(
      find.byKey(const ValueKey('permission-request-missing')),
      findsNothing,
    );
    expect(calls.any((call) => call.method == 'requestPermissions'), false);
    state = permissionState();
    await tester.ensureVisible(
      find.byKey(const ValueKey('permission-review-refresh')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('permission-review-refresh')));
    await tester.pumpAndSettle();
    expect(find.textContaining('já estão concedidas'), findsOneWidget);
    expect(
      calls.any(
        (call) =>
            ['arm', 'trigger', 'requestPermissions'].contains(call.method),
      ),
      false,
    );
    await finish(tester, c);
  });

  test('detalhes ausentes ou inválidos não inventam permissões', () {
    expect(
      ProtectionStatus.fromMap({'permissionsGranted': true}).permissionDetails,
      isNull,
    );
    final details = ProtectionPermissionDetails.fromMap({
      'location': 'unexpected',
      'microphone': null,
      'preciseLocation': 'yes',
      'gpsEnabled': 'yes',
      'canRequest': 'yes',
    });
    expect(details.location, isNull);
    expect(details.microphone, isNull);
    expect(details.preciseLocation, isNull);
    expect(details.gpsEnabled, isNull);
    expect(details.canRequest, false);
    expect(details.verified, false);
  });
}
