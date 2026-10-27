import 'package:flutter/material.dart';
import 'protection.dart';
import 'reserved_identity.dart';

class PermissionReview extends StatelessWidget {
  const PermissionReview({super.key, required this.protection});
  final ProtectionController protection;

  String _description(String? value) => switch (value) {
    'granted' => 'Permitida',
    'request' => 'Falta autorizar',
    'settings' => 'Revisar nos ajustes do Android',
    'notRequired' => 'Não solicitada nesta configuração',
    _ => 'Estado não informado pelo Android',
  };

  Widget _row(IconData icon, String label, String description) => Padding(
    padding: const EdgeInsets.only(top: 14),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 21, color: ReservedPalette.plum),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(
                description,
                style: const TextStyle(
                  color: ReservedPalette.muted,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: protection,
    builder: (context, _) {
      final s = protection.status;
      final details = s.permissionDetails;
      final verified = details?.verified == true;
      final canRequest = verified && details!.canRequest;
      final allGranted =
          verified &&
          s.permissionsGranted &&
          details!.location == 'granted' &&
          ['granted', 'notRequired'].contains(details.microphone) &&
          ['granted', 'notRequired'].contains(details.notifications) &&
          !details.canRequest &&
          !details.needsAppSettings;
      return AlertDialog(
        key: const ValueKey('permission-review-dialog'),
        title: const Text('Permissões do aparelho'),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Semantics(
                  liveRegion: true,
                  child: Text(
                    !verified
                        ? 'Não foi possível verificar as permissões. Toque em Atualizar para consultar novamente.'
                        : details!.gpsEnabled == false
                        ? 'A localização do aparelho está desligada. Revise as permissões e abra os ajustes de localização abaixo.'
                        : allGranted
                        ? 'As permissões necessárias já estão concedidas. O Android não precisa abrir uma nova solicitação.'
                        : 'Revise abaixo o que falta. Nenhuma permissão é alterada só por abrir esta tela.',
                    style: const TextStyle(fontSize: 14, height: 1.5),
                  ),
                ),
                if (verified) ...[
                  _row(
                    Icons.location_on_outlined,
                    'Localização',
                    details!.location == 'granted' &&
                            details.preciseLocation == false
                        ? 'Permitida · precisão aproximada'
                        : _description(details.location),
                  ),
                  _row(
                    Icons.mic_none_outlined,
                    'Áudio durante ocorrência',
                    _description(details.microphone),
                  ),
                  _row(
                    Icons.notifications_none,
                    'Notificações',
                    _description(details.notifications),
                  ),
                  _row(
                    Icons.gps_fixed,
                    'Localização do aparelho',
                    details.gpsEnabled == true
                        ? 'Ligada'
                        : details.gpsEnabled == false
                        ? 'Desligada · abra os ajustes para ligar'
                        : 'Estado não informado pelo Android',
                  ),
                ],
                const SizedBox(height: 18),
                const Text(
                  'O botão flutuante tem uma permissão separada de exibição sobre outros apps. Prepare essa opção no cartão “Botão Lume”.',
                  style: TextStyle(
                    color: ReservedPalette.muted,
                    fontSize: 12,
                    height: 1.5,
                  ),
                ),
                if (protection.error != null) ...[
                  const SizedBox(height: 12),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      protection.error!,
                      style: const TextStyle(color: ReservedPalette.rose),
                    ),
                  ),
                ],
                if (protection.busy) ...[
                  const SizedBox(height: 12),
                  const LinearProgressIndicator(),
                ],
                if (canRequest) ...[
                  const SizedBox(height: 16),
                  FilledButton(
                    key: const ValueKey('permission-request-missing'),
                    onPressed: protection.busy
                        ? null
                        : () => protection.call('requestPermissions'),
                    child: const Text('Solicitar permissões faltantes'),
                  ),
                ],
                if (!verified) ...[
                  const SizedBox(height: 10),
                  OutlinedButton(
                    key: const ValueKey('permission-review-refresh'),
                    onPressed: protection.busy ? null : protection.refresh,
                    child: const Text('Atualizar'),
                  ),
                ],
                if (verified && details!.gpsEnabled == false) ...[
                  const SizedBox(height: 10),
                  OutlinedButton(
                    key: const ValueKey('permission-location-settings'),
                    onPressed: protection.busy
                        ? null
                        : () => protection.call('openLocationSettings', {
                            'consent': true,
                          }),
                    child: const Text('Abrir ajustes de localização'),
                  ),
                ],
                const SizedBox(height: 10),
                OutlinedButton(
                  key: const ValueKey('permission-app-settings'),
                  onPressed: protection.busy
                      ? null
                      : () => protection.call('openAppSettings', {
                          'consent': true,
                        }),
                  child: Text(
                    verified && details!.needsAppSettings
                        ? 'Revisar permissões nos ajustes do Android'
                        : 'Ver ajustes do aplicativo',
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            key: const ValueKey('permission-review-close'),
            onPressed: () => Navigator.pop(context),
            child: const Text('Fechar'),
          ),
        ],
      );
    },
  );
}
