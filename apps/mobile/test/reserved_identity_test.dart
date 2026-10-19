import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lume_navegador/browser.dart';
import 'package:lume_navegador/main.dart';
import 'package:lume_navegador/protection.dart';
import 'package:lume_navegador/reserved.dart';
import 'package:lume_navegador/reserved_identity.dart';

const previewDirectory = String.fromEnvironment('RESERVED_PREVIEW_DIR');
const native = MethodChannel('reserved-identity-test');
const previewKey = ValueKey('reserved-preview-boundary');

Future<void> savePreview(WidgetTester tester, String name) async {
  if (previewDirectory.isEmpty) return;
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find.byKey(previewKey),
  );
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 2);
    try {
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      final directory = Directory(previewDirectory)
        ..createSync(recursive: true);
      await File(
        '${directory.path}/$name.png',
      ).writeAsBytes(bytes!.buffer.asUint8List());
    } finally {
      image.dispose();
    }
  });
}

Future<void> loadPreviewImages(WidgetTester tester) async {
  if (previewDirectory.isEmpty) return;
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
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('marca e tema privados não aparecem antes nem após o acesso', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final methods = <String>[];
    Map<String, Object?> nativeState = {'paired': false};
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(native, (
      call,
    ) async {
      methods.add(call.method);
      return nativeState;
    });
    if (previewDirectory.isNotEmpty) {
      await tester.runAsync(() async {
        final fonts = FontLoader('Montserrat')
          ..addFont(rootBundle.load('assets/fonts/Montserrat-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Montserrat-SemiBold.ttf'));
        await fonts.load();
        await (FontLoader(
          'MaterialIcons',
        )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      });
    }
    final protection = ProtectionController(channel: native);
    await tester.pumpWidget(
      RepaintBoundary(
        key: previewKey,
        child: LumeApp(protection: protection),
      ),
    );
    await tester.pumpAndSettle();
    if (previewDirectory.isNotEmpty) {
      await tester.runAsync(
        () => precacheImage(
          const AssetImage('assets/brand/icon-v2.png'),
          tester.element(find.byType(BrowserHome)),
        ),
      );
      await tester.pumpAndSettle();
    }
    expect(find.byType(ReservedIdentityHeader), findsNothing);
    expect(find.text('SOS Mulher'), findsNothing);
    expect(
      Theme.of(tester.element(find.byType(BrowserHome))).colorScheme.primary,
      ink,
    );
    expect(find.text('O que vamos\nexplorar?'), findsOneWidget);
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is Image &&
            widget.image is AssetImage &&
            (widget.image as AssetImage).assetName ==
                'assets/brand/icon-v2.png',
      ),
      findsOneWidget,
    );
    await savePreview(tester, 'lume-browser');
    await tester.tap(find.byTooltip('Área reservada'));
    await tester.pumpAndSettle();
    expect(methods, contains('authenticateReserved'));
    expect(find.byType(ReservedIdentityHeader), findsOneWidget);
    final privateContext = tester.element(find.byType(ReservedIdentityHeader));
    expect(Theme.of(privateContext).colorScheme.primary, ReservedPalette.plum);
    expect(find.text('SOS Mulher'), findsOneWidget);
    await loadPreviewImages(tester);
    await savePreview(tester, 'sos-reserved');

    // A dialog must inherit the private palette without changing the root theme.
    nativeState = {
      'paired': true,
      'armed': true,
      'incidentId': 'fictional-preview',
    };
    await protection.refresh();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Interromper compartilhamento'),
      400,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Interromper compartilhamento'));
    await tester.pumpAndSettle();
    expect(
      Theme.of(tester.element(find.byType(AlertDialog))).colorScheme.primary,
      ReservedPalette.plum,
    );
    // Closing over keyguard/background must remove both the dialog and brand.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.byType(ReservedIdentityHeader), findsNothing);
    expect(find.text('SOS Mulher'), findsNothing);
    expect(find.text('O que vamos\nexplorar?'), findsOneWidget);
    expect(
      Theme.of(tester.element(find.byType(BrowserHome))).colorScheme.primary,
      ink,
    );
    expect(methods, contains('leaveReserved'));
    expect(methods.where((name) => ['arm', 'trigger'].contains(name)), isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      native,
      null,
    );
  });

  testWidgets(
    'área privada continua utilizável com tela estreita e fonte maior',
    (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      Map<String, Object?> nativeState = {'paired': false};
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        native,
        (call) async => nativeState,
      );
      final protection = ProtectionController(channel: native);
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(1.6)),
            child: child!,
          ),
          home: ReservedPage(protection: protection),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(
        find.text('Vincular com meu consentimento'),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      expect(tester.takeException(), isNull);
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton).first).onPressed,
        isNull,
      );
      nativeState = {'paired': true, 'voiceAvailable': true};
      await protection.refresh();
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('voice-enable')),
        350,
        scrollable: find.byType(Scrollable).last,
        maxScrolls: 80,
      );
      expect(tester.takeException(), isNull);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const ValueKey('voice-enable')))
            .onPressed,
        isNull,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      protection.dispose();
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        native,
        null,
      );
    },
  );
}
