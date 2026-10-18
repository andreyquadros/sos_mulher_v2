import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:lume_navegador/main.dart';
import 'package:lume_navegador/protection.dart';

const pairingCode = String.fromEnvironment('E2E_PAIRING_CODE');
const base = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3001',
);

class DemoCentral {
  final http = HttpClient();
  List<Cookie> cookies = [];
  Future<Map<String, dynamic>> request(
    String method,
    String path, [
    Map<String, Object?>? body,
  ]) async {
    final req = await http.openUrl(method, Uri.parse('$base/api/$path'));
    req.headers.set('Origin', 'http://127.0.0.1:5173');
    req.cookies.addAll(cookies);
    if (body != null) {
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode(body));
    }
    final response = await req.close();
    if (path == 'auth/login') cookies = response.cookies;
    final data =
        jsonDecode(await utf8.decoder.bind(response).join())
            as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw StateError(
        'API teste: HTTP ${response.statusCode}, ${data['error']}',
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> incident(String id) async {
    final data = await request('GET', 'snapshot');
    return (data['incidents'] as List).cast<Map<String, dynamic>>().firstWhere(
      (item) => item['id'] == id,
    );
  }

  Future<Map<String, dynamic>> waitIncident(
    String id,
    bool Function(Map<String, dynamic>) ready,
  ) async {
    final until = DateTime.now().add(const Duration(seconds: 45));
    while (DateTime.now().isBefore(until)) {
      final current = await incident(id);
      if (ready(current)) return current;
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    throw StateError(
      'A ocorrência não atingiu o estado esperado em 45 segundos.',
    );
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'Android: vínculo, FGS, GPS/AAC, pausa e encerramento pela central',
    (tester) async {
      final central = DemoCentral();
      final protection = ProtectionController();
      await tester.pumpWidget(LumeApp(protection: protection));
      await tester.pumpAndSettle();
      expect(find.text('O que vamos\nexplorar?'), findsOneWidget);
      // IntegrationTest uses the live device scheduler; platform calls are awaited directly.
      {
        debugPrint('E2E: verificar demo e autenticar');
        expect((await central.request('GET', 'health'))['demoMode'], true);
        await central.request('POST', 'auth/login', {
          'email': 'demo@mulher.ro.gov.br',
          'password': 'Lume-Demo-2026!',
        });
        expect(
          await protection.call('configure', {
            'baseUrl': base,
            'code': pairingCode,
            'consentLocation': true,
            'consentAudio': true,
          }),
          true,
          reason: protection.error,
        );
        expect(protection.status.paired, true);
        debugPrint('E2E: vinculo salvo; armar servico');
        expect(await protection.call('arm'), true, reason: protection.error);
        await Future<void>.delayed(const Duration(seconds: 2));
        await protection.refresh();
        expect(
          protection.status.armed,
          true,
          reason: protection.status.lastError,
        );
        expect(
          await protection.call('trigger', {
            'simulated': true,
            'trigger': 'hold',
          }),
          true,
        );
        final until = DateTime.now().add(const Duration(seconds: 30));
        while (protection.status.receivedAt == null &&
            DateTime.now().isBefore(until)) {
          await Future<void>.delayed(const Duration(seconds: 1));
          await protection.refresh();
        }
        expect(
          protection.status.receivedAt,
          isNotNull,
          reason: protection.status.lastError,
        );
        debugPrint('E2E: servidor recebeu alerta');
        final id = protection.status.incidentId!;
        final active = await central.waitIncident(
          id,
          (item) =>
              item['lastLocation'] != null && (item['audioCount'] as int) > 0,
        );
        debugPrint('E2E: GPS e audio recebidos');
        expect(active['simulated'], true);
        expect((active['lastLocation'] as Map)['accuracy'], isA<num>());
        final audio = await central.request('GET', 'incidents/$id/audio');
        expect((audio['chunks'] as List).isNotEmpty, true);
        expect(await protection.call('stopSharing'), true);
        expect(protection.status.sharingPaused, true);
        await central.request('POST', 'incidents/$id/ack', {});
        final acknowledged = await central.incident(id);
        await central.request('POST', 'incidents/$id/claim', {
          'expectedRevision': acknowledged['revision'],
        });
        final assigned = await central.incident(id);
        await central.request('POST', 'incidents/$id/resolve', {
          'expectedRevision': assigned['revision'],
          'resolution':
              'Ensaio técnico fictício concluído no emulador Android.',
        });
        final resolved = await central.waitIncident(
          id,
          (item) => item['status'] == 'resolved',
        );
        expect(resolved['resolvedAt'], isNotNull);
        final stopBy = DateTime.now().add(const Duration(seconds: 25));
        while (protection.status.hasIncident &&
            DateTime.now().isBefore(stopBy)) {
          await Future<void>.delayed(const Duration(seconds: 1));
          await protection.refresh();
        }
        expect(
          protection.status.hasIncident,
          false,
          reason: protection.status.lastError,
        );
        await protection.call('disarm');
        await central.request('POST', 'auth/logout', {});
        central.http.close();
      }
      await tester.pumpWidget(const SizedBox.shrink());
    },
    skip: pairingCode.isEmpty,
  );
}
