import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lume_navegador/main.dart';
import 'package:lume_navegador/protection.dart';
import 'package:lume_navegador/protection_guide.dart';
import 'package:lume_navegador/reserved.dart';
import 'package:lume_navegador/reserved_identity.dart';

const native = MethodChannel('protection-guide-test');
const previewDirectory = String.fromEnvironment('PROTECTION_GUIDE_PREVIEW_DIR');
const previewKey = ValueKey('guide-preview-boundary');

class GuideNativeFixture {
  int presentations = 0;
  int session = 0;
  final claims = <int, Map<String, Object?>>{};
  final methods = <String>[];
  Map<String, Object?> state = {'paired': false};
  bool authAllowed = true;
  bool claimError = false;
  Completer<Map<String, Object?>>? pendingClaim;

  Future<Object?> invoke(MethodCall call) async {
    methods.add(call.method);
    if (call.method == 'authenticateReserved') {
      if (!authAllowed) throw PlatformException(code: 'cancelled');
      session++;
    }
    if (call.method == 'claimProtectionGuide') {
      if (claimError) throw PlatformException(code: 'storage-unavailable');
      if (pendingClaim != null) return pendingClaim!.future;
      return claims.putIfAbsent(session, () {
        final show = presentations < 3;
        if (show) presentations++;
        return {'show': show, 'visit': presentations};
      });
    }
    return state;
  }

  int get claimCalls =>
      methods.where((m) => m == 'claimProtectionGuide').length;

  void expectNoProtectionCommands() {
    expect(
      methods.where(
        (name) => ![
          'status',
          'authenticateReserved',
          'claimProtectionGuide',
          'leaveReserved',
        ].contains(name),
      ),
      isEmpty,
    );
  }
}

Future<ProtectionController> mountApp(WidgetTester tester) async {
  final protection = ProtectionController(channel: native);
  await tester.pumpWidget(LumeApp(key: UniqueKey(), protection: protection));
  await tester.pumpAndSettle();
  return protection;
}

Future<void> enter(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Área reservada'));
  await tester.pumpAndSettle();
}

Future<void> closeGuide(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('guide-close')));
  await tester.pumpAndSettle();
}

void background(WidgetTester tester) {
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
}

Future<void> savePreview(WidgetTester tester, String name) async {
  if (previewDirectory.isEmpty) return;
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late GuideNativeFixture fixture;

  setUp(() {
    fixture = GuideNativeFixture();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(native, fixture.invoke);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(native, null);
  });

  testWidgets('três acessos privados, reinício e ajuda manual sem recontagem', (
    tester,
  ) async {
    var protection = await mountApp(tester);
    expect(find.byType(ProtectionGuide), findsNothing);
    expect(fixture.claimCalls, 0);
    for (var visit = 1; visit <= 4; visit++) {
      if (visit == 3) {
        // A new Flutter/controller instance models an app restart. The native
        // preference fixture is deliberately retained, as tested by the JVM suite.
        await tester.pumpWidget(const SizedBox.shrink());
        protection = await mountApp(tester);
      }
      await enter(tester);
      expect(
        find.byType(ProtectionGuide),
        visit <= 3 ? findsOneWidget : findsNothing,
      );
      if (visit <= 3) await closeGuide(tester);
      final calls = fixture.claimCalls;
      await protection.refresh();
      await protection.refresh();
      await tester.pumpAndSettle();
      expect(fixture.claimCalls, calls);
      expect(find.byType(ProtectionGuide), findsNothing);
      await tester.tap(find.byTooltip('Guia de proteção'));
      await tester.pumpAndSettle();
      expect(find.byType(ProtectionGuide), findsOneWidget);
      expect(fixture.claimCalls, calls);
      await closeGuide(tester);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byType(ReservedPage), findsNothing);
    }
    expect(fixture.presentations, 3);
    expect(fixture.claimCalls, 4);
    fixture.expectNoProtectionCommands();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('autenticação negada não abre guia nem conta acesso', (
    tester,
  ) async {
    fixture.authAllowed = false;
    await mountApp(tester);
    await enter(tester);
    expect(find.byType(ReservedPage), findsNothing);
    expect(find.byType(ProtectionGuide), findsNothing);
    expect(find.text('O que vamos\nexplorar?'), findsOneWidget);
    expect(fixture.claimCalls, 0);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('falha de preferências preserva proteção e ajuda manual', (
    tester,
  ) async {
    fixture.claimError = true;
    final protection = await mountApp(tester);
    await enter(tester);
    expect(find.byType(ProtectionGuide), findsNothing);
    expect(protection.error, isNull);
    expect(fixture.claimCalls, 1);
    await protection.refresh();
    await tester.pumpAndSettle();
    expect(fixture.claimCalls, 1);
    await tester.tap(find.byTooltip('Guia de proteção'));
    await tester.pumpAndSettle();
    expect(find.byType(ProtectionGuide), findsOneWidget);
    expect(fixture.claimCalls, 1);
    fixture.expectNoProtectionCommands();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'ocorrência tem prioridade; guia aguarda e fecha com novo alerta',
    (tester) async {
      fixture.state = {
        'paired': true,
        'armed': true,
        'incidentId': 'fictional-a',
      };
      final protection = await mountApp(tester);
      await enter(tester);
      expect(fixture.claimCalls, 0);
      expect(find.byType(ProtectionGuide), findsNothing);
      await tester.tap(find.byTooltip('Guia de proteção'));
      await tester.pumpAndSettle();
      expect(find.byType(ProtectionGuide), findsOneWidget);
      await protection.refresh();
      await tester.pumpAndSettle();
      expect(find.byType(ProtectionGuide), findsOneWidget);
      await closeGuide(tester);
      fixture.state = {'paired': true, 'armed': true};
      await protection.refresh();
      await tester.pumpAndSettle();
      expect(fixture.claimCalls, 1);
      expect(find.byType(ProtectionGuide), findsOneWidget);
      fixture.state = {
        'paired': true,
        'armed': true,
        'incidentId': 'fictional-b',
      };
      await protection.refresh();
      await tester.pumpAndSettle();
      expect(find.byType(ProtectionGuide), findsNothing);
      expect(find.byType(ReservedPage), findsOneWidget);
      fixture.expectNoProtectionCommands();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'bloqueio fecha guia e rota privada; resposta atrasada não reabre',
    (tester) async {
      fixture.pendingClaim = Completer<Map<String, Object?>>();
      await mountApp(tester);
      await enter(tester);
      expect(fixture.claimCalls, 1);
      background(tester);
      await tester.pumpAndSettle();
      fixture.pendingClaim!.complete({'show': true, 'visit': 1});
      await tester.pumpAndSettle();
      expect(find.byType(ProtectionGuide), findsNothing);
      expect(find.byType(ReservedIdentityHeader), findsNothing);
      expect(find.text('O que vamos\nexplorar?'), findsOneWidget);
      fixture.pendingClaim = null;
      await enter(tester);
      expect(find.byType(ProtectionGuide), findsOneWidget);
      expect(
        Theme.of(
          tester.element(find.byType(ProtectionGuide)),
        ).colorScheme.primary,
        ReservedPalette.plum,
      );
      background(tester);
      await tester.pumpAndSettle();
      expect(find.byType(ProtectionGuide), findsNothing);
      expect(find.text('SOS Mulher'), findsNothing);
      expect(find.byType(ReservedPage), findsNothing);
      expect(fixture.methods, contains('leaveReserved'));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('resposta atrasada espera uma operação em andamento', (
    tester,
  ) async {
    fixture.pendingClaim = Completer<Map<String, Object?>>();
    final protection = await mountApp(tester);
    await enter(tester);
    protection.busy = true;
    fixture.pendingClaim!.complete({'show': true, 'visit': 1});
    await tester.pumpAndSettle();
    expect(find.byType(ProtectionGuide), findsNothing);
    expect(fixture.claimCalls, 1);
    protection.busy = false;
    await protection.refresh();
    await tester.pumpAndSettle();
    expect(find.byType(ProtectionGuide), findsOneWidget);
    expect(fixture.claimCalls, 1);
    fixture.expectNoProtectionCommands();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'ajuda manual durante leitura lenta não reaparece com a resposta',
    (tester) async {
      fixture.pendingClaim = Completer<Map<String, Object?>>();
      final protection = await mountApp(tester);
      await enter(tester);
      await tester.tap(find.byTooltip('Guia de proteção'));
      await tester.pumpAndSettle();
      await closeGuide(tester);
      fixture.pendingClaim!.complete({'show': true, 'visit': 1});
      await tester.pumpAndSettle();
      await protection.refresh();
      await tester.pumpAndSettle();
      expect(find.byType(ProtectionGuide), findsNothing);
      expect(fixture.claimCalls, 1);
      fixture.expectNoProtectionCommands();
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'ajuda manual de ocorrência anterior cede lugar a nova ocorrência',
    (tester) async {
      fixture.state = {
        'paired': true,
        'armed': true,
        'incidentId': 'fictional-a',
      };
      final protection = await mountApp(tester);
      await enter(tester);
      await tester.tap(find.byTooltip('Guia de proteção'));
      await tester.pumpAndSettle();
      fixture.state = {'paired': true, 'armed': true};
      await protection.refresh();
      await tester.pumpAndSettle();
      expect(find.byType(ProtectionGuide), findsOneWidget);
      fixture.state = {
        'paired': true,
        'armed': true,
        'incidentId': 'fictional-b',
      };
      await protection.refresh();
      await tester.pumpAndSettle();
      expect(find.byType(ProtectionGuide), findsNothing);
      expect(fixture.claimCalls, 0);
      fixture.expectNoProtectionCommands();
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('demonstração do volume mostra o ritmo sem executar comandos', (
    tester,
  ) async {
    await mountApp(tester);
    await enter(tester);
    for (var next = 0; next < 2; next++) {
      await tester.tap(find.byKey(const ValueKey('guide-next')));
      await tester.pumpAndSettle();
    }
    await tester.ensureVisible(find.byKey(const ValueKey('guide-play-volume')));
    await tester.tap(find.byKey(const ValueKey('guide-play-volume')));
    await tester.pump();
    expect(find.text('1 · Toque BAIXAR e solte'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.text('2 · Toque SUBIR e solte'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 650));
    expect(find.text('3 · Toque BAIXAR e solte'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 650));
    expect(find.text('4 · Mantenha SUBIR por 3 segundos…'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 3100));
    expect(find.text('Agora SOLTE o botão SUBIR'), findsOneWidget);
    await tester.pumpAndSettle();
    fixture.expectNoProtectionCommands();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  test(
    'respostas inválidas ou plugin ausente não autorizam apresentação',
    () async {
      final protection = ProtectionController(channel: native);
      for (final answer in [
        null,
        true,
        {'show': true},
        {'show': true, 'visit': 0},
        {'show': true, 'visit': 4},
        {'show': true, 'visit': '1'},
      ]) {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(native, (_) async => answer);
        expect(await protection.claimProtectionGuide(), isFalse);
      }
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            native,
            (_) async => throw MissingPluginException(),
          );
      expect(await protection.claimProtectionGuide(), isFalse);
      protection.dispose();
    },
  );

  testWidgets('guia silencioso completo, fonte maior e movimento reduzido', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    if (previewDirectory.isNotEmpty) {
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
    }
    final protection = ProtectionController(channel: native);
    Widget guideFixture(double textScale, bool reducedMotion) =>
        RepaintBoundary(
          key: previewKey,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: reservedTheme(ThemeData(fontFamily: 'Montserrat')),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(textScale),
                disableAnimations: reducedMotion,
              ),
              child: child!,
            ),
            home: ReservedPage(protection: protection),
          ),
        );
    await tester.pumpWidget(guideFixture(1.6, true));
    await tester.pumpAndSettle();
    expect(find.byType(ProtectionGuide), findsOneWidget);
    if (previewDirectory.isNotEmpty) {
      await tester.runAsync(
        () => precacheImage(
          const AssetImage('assets/reserved/sos-emblem-v3.png'),
          tester.element(find.byType(ProtectionGuide)),
        ),
      );
      await tester.pumpAndSettle();
    }
    await savePreview(tester, 'mobile-guide-first-large-font');
    for (var step = 0; step < 5; step++) {
      expect(find.byKey(ValueKey('guide-step-$step')), findsOneWidget);
      expect(tester.takeException(), isNull);
      final switcher = tester.widget<AnimatedSwitcher>(
        find.byType(AnimatedSwitcher),
      );
      expect(switcher.duration, Duration.zero);
      if (step == 2) {
        await savePreview(tester, 'mobile-guide-volume-large-font');
      }
      if (step == 3) await savePreview(tester, 'mobile-guide-voice-large-font');
      await tester.tap(find.byKey(const ValueKey('guide-next')));
      await tester.pumpAndSettle();
    }
    expect(find.byType(ProtectionGuide), findsNothing);
    expect(fixture.presentations, 1);
    // A normal-size render of the same help is useful for visual review. The
    // manual opening does not create another automatic presentation.
    if (previewDirectory.isNotEmpty) {
      await tester.pumpWidget(guideFixture(1, false));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Guia de proteção'));
      await tester.pumpAndSettle();
      await savePreview(tester, 'mobile-guide-first');
      for (var step = 0; step < 3; step++) {
        await tester.tap(find.byKey(const ValueKey('guide-next')));
        await tester.pumpAndSettle();
        if (step == 1) await savePreview(tester, 'mobile-guide-volume');
        if (step == 2) await savePreview(tester, 'mobile-guide-voice');
      }
      expect(fixture.presentations, 1);
    }
    fixture.expectNoProtectionCommands();
    await tester.pumpWidget(const SizedBox.shrink());
    protection.dispose();
  });
}
