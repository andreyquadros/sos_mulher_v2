import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lume_navegador/floating_trigger_card.dart';
import 'package:lume_navegador/hold_button.dart';
import 'package:lume_navegador/protection.dart';
import 'package:lume_navegador/reserved.dart';
import 'package:lume_navegador/reserved_identity.dart';

const channel = MethodChannel('floating-test');
const previewDirectory = String.fromEnvironment('FLOATING_PREVIEW_DIR');
const previewKey = ValueKey('floating-preview-boundary');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('estado exige vínculo, serviço, permissão e treino para habilitar', () {
    final ready = ProtectionStatus.fromMap({
      'paired': true,
      'armed': true,
      'floatingPermission': true,
      'floatingTrainingPassed': true,
      'floatingCooldownSeconds': 90,
    });
    expect(ready.floatingActivationAllowed, true);
    expect(ready.floatingTriggerReady, false);
    expect(ready.floatingCooldownSeconds, 30);
    for (final missing in [
      'paired',
      'armed',
      'floatingPermission',
      'floatingTrainingPassed',
    ]) {
      final values = {
        'paired': true,
        'armed': true,
        'floatingPermission': true,
        'floatingTrainingPassed': true,
      }..[missing] = false;
      expect(ProtectionStatus.fromMap(values).floatingActivationAllowed, false);
    }
    expect(
      const ProtectionStatus(
        paired: true,
        armed: true,
        floatingPermission: true,
        floatingTrainingPassed: true,
        incidentId: 'fictional',
      ).floatingActivationAllowed,
      false,
    );
    expect(
      const ProtectionStatus(
        paired: true,
        armed: true,
        floatingPermission: true,
        floatingEnabled: true,
        floatingError: 'Permissão revogada',
      ).floatingTriggerReady,
      false,
    );
  });

  Future<ProtectionController> mount(
    WidgetTester tester,
    Map<String, Object?> state,
    List<MethodCall> methods,
  ) async {
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      methods.add(call);
      return state;
    });
    final c = ProtectionController(channel: channel)
      ..status = ProtectionStatus.fromMap(state);
    await tester.pumpWidget(
      MaterialApp(
        theme: reservedTheme(ThemeData()),
        home: Scaffold(
          body: ListenableBuilder(
            listenable: c,
            builder: (_, _) => SingleChildScrollView(
              child: FloatingTriggerCard(protection: c),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    addTearDown(() {
      c.dispose();
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        null,
      );
    });
    return c;
  }

  testWidgets('permissão exige escolha e treino não envia ocorrência', (
    tester,
  ) async {
    final methods = <MethodCall>[];
    final state = <String, Object?>{'paired': true, 'armed': true};
    final c = await mount(tester, state, methods);
    await tester.ensureVisible(
      find.byKey(const ValueKey('floating-permission')),
    );
    await tester.tap(find.byKey(const ValueKey('floating-permission')));
    await tester.pumpAndSettle();
    expect(methods, isEmpty);
    await tester.tap(find.text('Agora não'));
    await tester.pumpAndSettle();
    expect(methods, isEmpty);
    await tester.tap(find.byKey(const ValueKey('floating-permission')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Abrir ajustes do Android'));
    await tester.pumpAndSettle();
    expect(methods.single.method, 'requestFloatingPermission');
    expect(methods.single.arguments, {'consent': true});
    methods.clear();
    state['floatingPermission'] = true;
    await c.refresh();
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('floating-enable')))
          .onPressed,
      isNull,
    );
    methods.clear();
    await tester.ensureVisible(find.byKey(const ValueKey('floating-training')));
    await tester.tap(find.byKey(const ValueKey('floating-training')));
    await tester.pumpAndSettle();
    expect(methods.single.method, 'startFloatingTraining');
    expect(methods.where((m) => m.method == 'trigger'), isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('treino concluído pede consentimento separado para uso real', (
    tester,
  ) async {
    final methods = <MethodCall>[];
    final state = <String, Object?>{
      'paired': true,
      'armed': true,
      'floatingPermission': true,
      'floatingTrainingPassed': true,
    };
    await mount(tester, state, methods);
    await tester.ensureVisible(find.byKey(const ValueKey('floating-enable')));
    await tester.tap(find.byKey(const ValueKey('floating-enable')));
    await tester.pumpAndSettle();
    expect(methods, isEmpty);
    await tester.tap(find.text('Habilitar alerta real'));
    await tester.pumpAndSettle();
    expect(methods.single.method, 'setFloatingEnabled');
    expect(methods.single.arguments, {'enabled': true, 'consent': true});
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('atalhos avançados começam fechados na área reservada', (
    tester,
  ) async {
    final c = ProtectionController(channel: channel)
      ..status = const ProtectionStatus(paired: true, armed: true);
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      (_) async => {'paired': true, 'armed': true},
    );
    await tester.pumpWidget(MaterialApp(home: ReservedPage(protection: c)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('floating-trigger-card')),
      350,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.byType(FloatingTriggerCard), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('optional-trigger-options')),
      350,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Outros atalhos opcionais'), findsOneWidget);
    expect(find.byKey(const ValueKey('voice-enable')), findsNothing);
    expect(find.byKey(const ValueKey('physical-enable')), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    c.dispose();
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      null,
    );
  });

  testWidgets('remover botão durante ocorrência preserva o compartilhamento', (
    tester,
  ) async {
    final methods = <MethodCall>[];
    final state = <String, Object?>{
      'paired': true,
      'armed': true,
      'incidentId': 'fictional-incident',
      'floatingEnabled': true,
    };
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      methods.add(call);
      return state;
    });
    final protection = ProtectionController(channel: channel)
      ..status = ProtectionStatus.fromMap(state);
    await tester.pumpWidget(
      MaterialApp(home: ReservedPage(protection: protection)),
    );
    await tester.pumpAndSettle();
    expect(find.byType(FloatingTriggerCard), findsNothing);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('floating-disable-incident')),
      250,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.ensureVisible(
      find.byKey(const ValueKey('floating-disable-incident')),
    );
    methods.clear();
    await tester.tap(find.byKey(const ValueKey('floating-disable-incident')));
    await tester.pumpAndSettle();
    expect(methods.single.method, 'setFloatingEnabled');
    expect(methods.single.arguments, {'enabled': false});
    expect(protection.status.sharingPaused, false);
    expect(protection.status.hasIncident, true);
    await tester.pumpWidget(const SizedBox.shrink());
    protection.dispose();
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      null,
    );
  });

  testWidgets(
    'acesso pareado mostra alerta, remover e pausar na primeira tela',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final state = <String, Object?>{
        'paired': true,
        'armed': true,
        'permissionsGranted': true,
        'floatingPermission': true,
        'floatingEnabled': true,
        'floatingVisible': true,
        'floatingTrainingPassed': true,
      };
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        (_) async => state,
      );
      final c = ProtectionController(channel: channel)
        ..status = ProtectionStatus.fromMap(state);
      await tester.pumpWidget(MaterialApp(home: ReservedPage(protection: c)));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<ReservedIdentityHeader>(find.byType(ReservedIdentityHeader))
            .compact,
        true,
      );
      expect(find.text('Seu cuidado,\nno seu tempo.'), findsNothing);
      for (final control in [
        find.byKey(const ValueKey('floating-reserved-alert')),
        find.byKey(const ValueKey('floating-disable')),
        find.text('Pausar serviço'),
      ]) {
        expect(control.hitTestable(), findsOneWidget);
      }
      expect(find.text('Revisar permissões'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        null,
      );
    },
  );

  testWidgets('layout compacto funciona a 320 pixels e fonte 1,6', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final state = <String, Object?>{
      'paired': true,
      'armed': true,
      'permissionsGranted': true,
      'floatingPermission': true,
      'floatingEnabled': true,
      'floatingVisible': true,
      'floatingTrainingPassed': true,
    };
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      (_) async => state,
    );
    final c = ProtectionController(channel: channel)
      ..status = ProtectionStatus.fromMap(state);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(1.6)),
          child: child!,
        ),
        home: ReservedPage(protection: c),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('floating-disable')),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(find.byKey(const ValueKey('floating-disable')));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('floating-disable')).hitTestable(),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    c.dispose();
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      null,
    );
  });

  testWidgets('movimento reduzido não encurta os cinco segundos', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: child!,
        ),
        home: Scaffold(
          body: HoldButton(
            label: 'Segure 5 s',
            color: Colors.red,
            enabled: true,
            onConfirmed: () async => calls++,
          ),
        ),
      ),
    );
    final pointer = await tester.startGesture(
      tester.getCenter(find.byType(HoldButton)),
    );
    await tester.pump(const Duration(milliseconds: 4999));
    expect(calls, 0);
    await tester.pump(const Duration(milliseconds: 1));
    expect(calls, 1);
    await tester.pump(const Duration(seconds: 8));
    expect(calls, 1);
    await pointer.up();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('soltar, arrastar, segundo dedo e sair cancelam a contagem', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HoldButton(
            label: 'Alerta',
            color: Colors.red,
            enabled: true,
            onConfirmed: () async => calls++,
          ),
        ),
      ),
    );
    final center = tester.getCenter(find.byType(HoldButton));
    var pointer = await tester.startGesture(center);
    await tester.pump(const Duration(milliseconds: 4999));
    await pointer.up();
    await tester.pump(const Duration(milliseconds: 1));
    expect(calls, 0);
    pointer = await tester.startGesture(center);
    await tester.pump(const Duration(seconds: 2));
    await pointer.moveBy(const Offset(9, 0));
    await tester.pump(const Duration(seconds: 5));
    expect(calls, 0);
    await pointer.up();
    pointer = await tester.startGesture(center);
    await tester.pump(const Duration(seconds: 2));
    final other = await tester.startGesture(
      center + const Offset(1, 0),
      pointer: 2,
    );
    await tester.pump(const Duration(seconds: 5));
    expect(calls, 0);
    await pointer.up();
    await other.up();
    pointer = await tester.startGesture(center);
    await tester.pump(const Duration(seconds: 2));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump(const Duration(seconds: 5));
    expect(calls, 0);
    await pointer.up();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'prévia reservada do botão flutuante com dados fictícios',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final state = <String, Object?>{
        'paired': true,
        'armed': true,
        'permissionsGranted': true,
        'floatingPermission': true,
        'floatingEnabled': true,
        'floatingVisible': true,
        'floatingTrainingPassed': true,
      };
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        (call) async => state,
      );
      final protection = ProtectionController(channel: channel)
        ..status = ProtectionStatus.fromMap(state);
      await tester.runAsync(() async {
        await (FontLoader('Montserrat')
              ..addFont(rootBundle.load('assets/fonts/Montserrat-Regular.ttf'))
              ..addFont(
                rootBundle.load('assets/fonts/Montserrat-SemiBold.ttf'),
              ))
            .load();
        await (FontLoader(
          'MaterialIcons',
        )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      });
      await tester.pumpWidget(
        RepaintBoundary(
          key: previewKey,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: reservedTheme(ThemeData(fontFamily: 'Montserrat')),
            home: ReservedPage(protection: protection),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final context = tester.element(find.byType(ReservedIdentityHeader));
      await tester.runAsync(() async {
        await precacheImage(
          const AssetImage('assets/reserved/sos-emblem-v3.png'),
          context,
        );
        await precacheImage(
          const AssetImage('assets/reserved/sos-symbol-v3.png'),
          context,
        );
      });
      await tester.pumpAndSettle();
      Future<void> save(String name) async {
        final boundary = tester.renderObject<RenderRepaintBoundary>(
          find.byKey(previewKey),
        );
        await tester.runAsync(() async {
          final image = await boundary.toImage(pixelRatio: 2);
          try {
            final data = await image.toByteData(format: ui.ImageByteFormat.png);
            Directory(previewDirectory).createSync(recursive: true);
            await File(
              '$previewDirectory/$name.png',
            ).writeAsBytes(data!.buffer.asUint8List());
          } finally {
            image.dispose();
          }
        });
      }

      await save('mobile-reserved-start');
      state.addAll({
        'floatingEnabled': false,
        'floatingVisible': false,
        'floatingTrainingPassed': false,
      });
      await protection.refresh();
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('floating-trigger-card')),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.ensureVisible(
        find.byKey(const ValueKey('floating-trigger-card')),
      );
      await tester.pumpAndSettle();
      await save('mobile-floating-setup');
      state.addAll({
        'floatingEnabled': true,
        'floatingVisible': true,
        'floatingTrainingPassed': true,
      });
      await protection.refresh();
      await tester.pumpAndSettle();
      await save('mobile-floating-active');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      protection.dispose();
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        null,
      );
    },
    skip: previewDirectory.isEmpty,
  );
}
