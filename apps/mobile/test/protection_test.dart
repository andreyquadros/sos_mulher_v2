import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lume_navegador/hold_button.dart';
import 'package:lume_navegador/main.dart';
import 'package:lume_navegador/protection.dart';
import 'package:lume_navegador/reserved.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('toque curto cancela; pressão de 3s envia uma única vez', (
    tester,
  ) async {
    int calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HoldButton(
            label: 'Alerta real',
            color: Colors.red,
            enabled: true,
            onConfirmed: () async {
              calls++;
              return calls;
            },
          ),
        ),
      ),
    );
    final button = find.byType(HoldButton);
    var pointer = await tester.startGesture(tester.getCenter(button));
    await tester.pump(const Duration(seconds: 1));
    await pointer.up();
    await tester.pump(const Duration(seconds: 3));
    expect(calls, 0);
    pointer = await tester.startGesture(tester.getCenter(button));
    for (var i = 0; i < 36; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(calls, 1);
    await tester.pump(const Duration(seconds: 4));
    expect(calls, 1);
    await pointer.up();
  });
  testWidgets('botão desabilitado não dispara', (tester) async {
    int calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HoldButton(
            label: 'Alerta',
            color: Colors.red,
            enabled: false,
            onConfirmed: () async {
              calls++;
              return calls;
            },
          ),
        ),
      ),
    );
    final pointer = await tester.startGesture(
      tester.getCenter(find.byType(HoldButton)),
    );
    await tester.pump(const Duration(seconds: 4));
    await pointer.up();
    expect(calls, 0);
  });
  test('estado distingue fila local, recebimento e responsável humano', () {
    expect(
      const ProtectionStatus(incidentId: 'local').alertLabel,
      'Aguardando envio',
    );
    expect(
      const ProtectionStatus(incidentId: 'i', receivedAt: '2026').alertLabel,
      'Recebida pela central',
    );
    expect(
      const ProtectionStatus(
        incidentId: 'i',
        assignedName: 'Equipe',
      ).alertLabel,
      'Acompanhada pela central',
    );
  });
  testWidgets('home abre navegador sem afirmar proteção ativa', (tester) async {
    const channel = MethodChannel('br.gov.ro.lume/protection');
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      (call) async => {'paired': false},
    );
    await tester.pumpWidget(const LumeApp());
    await tester.pump();
    expect(find.text('O que vamos\nexplorar?'), findsOneWidget);
    expect(find.text('Serviço ativo neste aparelho'), findsNothing);
    await tester.tap(find.byTooltip('Área reservada'));
    await tester.pumpAndSettle();
    expect(find.text('Vincule este aparelho'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Vincular com meu consentimento'),
      300,
      scrollable: find
          .byWidgetPredicate(
            (widget) =>
                widget is Scrollable &&
                widget.axisDirection == AxisDirection.down,
          )
          .last,
    );
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton).first).onPressed,
      isNull,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      null,
    );
  });
  testWidgets(
    'ocorrência aberta permite reativar, interromper e promover teste',
    (tester) async {
      tester.view.physicalSize = const Size(900, 2600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      const channel = MethodChannel('br.gov.ro.lume/protection');
      final methods = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
        call,
      ) async {
        methods.add(call.method);
        return {
          'paired': true,
          'incidentId': 'test',
          'simulated': true,
          'sharingPaused': true,
        };
      });
      final c = ProtectionController()
        ..status = const ProtectionStatus(
          paired: true,
          incidentId: 'test',
          simulated: true,
          armed: false,
        );
      await tester.pumpWidget(MaterialApp(home: ReservedPage(protection: c)));
      expect(find.text('Ativar proteção neste aparelho'), findsOneWidget);
      expect(find.text('Revisar permissões'), findsOneWidget);
      expect(find.text('Interromper compartilhamento'), findsOneWidget);
      expect(find.byType(HoldButton), findsOneWidget);
      await tester.tap(find.text('Interromper compartilhamento'));
      await tester.pumpAndSettle();
      expect(methods, isEmpty);
      await tester.tap(find.text('Interromper'));
      await tester.pumpAndSettle();
      expect(methods, ['stopSharing']);
      expect(find.text('Retomar compartilhamento'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        null,
      );
    },
  );
  test(
    'promoção pendente não exibe confirmação anterior como emergência recebida',
    () {
      expect(
        const ProtectionStatus(
          incidentId: 'test',
          receivedAt: '2026',
          assignedName: 'Equipe teste',
          escalationPending: true,
        ).alertLabel,
        'Alerta real aguardando envio',
      );
      expect(
        ProtectionStatus.fromMap({'acknowledgedAt': 'agora'}).alertLabel,
        'Reconhecida pela central',
      );
    },
  );
}
