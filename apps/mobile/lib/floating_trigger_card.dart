import 'package:flutter/material.dart';
import 'hold_button.dart';
import 'protection.dart';
import 'reserved_identity.dart';

class FloatingTriggerCard extends StatelessWidget {
  const FloatingTriggerCard({super.key, required this.protection});
  final ProtectionController protection;

  Future<bool> _consent(
    BuildContext context, {
    required String title,
    required String message,
    required String accept,
  }) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Agora não'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(accept),
            ),
          ],
        ),
      ) ==
      true;

  @override
  Widget build(BuildContext context) {
    final s = protection.status;
    final busy = protection.busy;
    return ReservedSectionCard(
      key: const ValueKey('floating-trigger-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: const BoxDecoration(
                  color: ReservedPalette.lavender,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.explore_outlined,
                  color: ReservedPalette.plum,
                  size: 25,
                ),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Botão Lume',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Segure por 5 segundos',
                      style: TextStyle(
                        color: ReservedPalette.tealInk,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'Segure o botão de navegador por 5 segundos para enviar um alerta real.',
            style: TextStyle(fontSize: 14, height: 1.4),
          ),
          const SizedBox(height: 10),
          const Text(
            'Soltar antes ou arrastar cancela a contagem.',
            style: TextStyle(color: ReservedPalette.muted, fontSize: 12),
          ),
          const SizedBox(height: 18),
          Semantics(
            liveRegion: true,
            child: Text(
              s.floatingTraining
                  ? 'Treino local ativo · segure o botão flutuante por 5 segundos'
                  : s.floatingTriggerReady
                  ? s.floatingCooldownSeconds > 0
                        ? 'Aguarde ${s.floatingCooldownSeconds} s para novo acionamento'
                        : s.floatingVisible
                        ? 'Visível · uso real habilitado'
                        : 'Uso real habilitado · confira se o botão está visível'
                  : s.floatingTrainingPassed
                  ? 'Treino concluído · falta habilitar o uso real'
                  : !s.armed
                  ? 'Primeiro, ative a proteção neste aparelho'
                  : !s.floatingPermission
                  ? '1 · Permita a exibição do botão no Android'
                  : '2 · Faça um treino local, sem enviar alerta',
              style: TextStyle(
                color: s.floatingTriggerReady || s.floatingTrainingPassed
                    ? ReservedPalette.tealInk
                    : ReservedPalette.plum,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ),
          if (s.floatingError != null && s.floatingError!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Semantics(
              liveRegion: true,
              child: Text(
                s.floatingError!,
                style: const TextStyle(color: ReservedPalette.rose),
              ),
            ),
          ],
          const SizedBox(height: 14),
          if (!s.floatingPermission)
            OutlinedButton.icon(
              key: const ValueKey('floating-permission'),
              icon: const Icon(Icons.open_in_new),
              label: const Text('Permitir botão sobre outros apps'),
              onPressed: busy
                  ? null
                  : () async {
                      final accepted = await _consent(
                        context,
                        title: 'Exibir o botão Lume?',
                        message:
                            'O Android abrirá “Exibir sobre outros apps”. Essa permissão permite que o botão Lume apareça durante o uso de outros aplicativos. Você pode removê-lo pela área reservada ou pausando o serviço. Ao voltar, entre novamente na área reservada para continuar.',
                        accept: 'Abrir ajustes do Android',
                      );
                      if (accepted) {
                        await protection.call('requestFloatingPermission', {
                          'consent': true,
                        });
                      }
                    },
            ),
          if (s.floatingTraining)
            OutlinedButton(
              key: const ValueKey('floating-stop-training'),
              onPressed: busy
                  ? null
                  : () => protection.call('stopFloatingTraining'),
              child: const Text('Encerrar treino local'),
            )
          else if (!s.floatingEnabled && s.floatingPermission) ...[
            OutlinedButton.icon(
              key: const ValueKey('floating-training'),
              icon: const Icon(Icons.touch_app_outlined),
              onPressed: busy || !s.floatingSetupAllowed
                  ? null
                  : () => protection.call('startFloatingTraining'),
              label: Text(
                s.floatingTrainingPassed
                    ? 'Repetir treino sem alerta'
                    : 'Treinar 5 segundos sem alerta',
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const ValueKey('floating-enable'),
              icon: const Icon(Icons.explore_outlined),
              onPressed: busy || !s.floatingActivationAllowed
                  ? null
                  : () async {
                      final accepted = await _consent(
                        context,
                        title: 'Habilitar o alerta pelo botão?',
                        message:
                            'Depois de habilitar, manter o botão flutuante pressionado por 5 segundos enviará um alerta real. Localização e áudio seguem suas escolhas de consentimento. O envio depende de rede e de uma central em operação.',
                        accept: 'Habilitar alerta real',
                      );
                      if (accepted) {
                        await protection.call('setFloatingEnabled', {
                          'enabled': true,
                          'consent': true,
                        });
                      }
                    },
              label: const Text('Habilitar botão para alerta real'),
            ),
          ],
          if (s.floatingEnabled)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: HoldButton(
                key: const ValueKey('floating-reserved-alert'),
                label: 'Segure 5 s para alerta real',
                color: ReservedPalette.rose,
                enabled: !busy,
                onConfirmed: () => protection.call('trigger', {
                  'simulated': false,
                  'trigger': 'hold',
                }),
              ),
            ),
          if (s.floatingEnabled)
            OutlinedButton(
              key: const ValueKey('floating-disable'),
              onPressed: busy
                  ? null
                  : () => protection.call('setFloatingEnabled', {
                      'enabled': false,
                    }),
              child: const Text('Remover botão flutuante'),
            ),
          const SizedBox(height: 12),
          const Text(
            'Use com a tela desbloqueada e o serviço ativo. Bloquear ou apagar a tela oculta o botão.',
            style: TextStyle(
              color: ReservedPalette.muted,
              fontSize: 12,
              height: 1.5,
            ),
          ),
          ExpansionTile(
            key: const ValueKey('floating-help-details'),
            tilePadding: EdgeInsets.zero,
            title: const Text('Como usar', style: TextStyle(fontSize: 13)),
            children: const [
              Text(
                'O botão fica sobre os outros aplicativos. Arraste para mudar a posição; um toque curto não envia alerta. Faça primeiro o treino local e depois autorize o uso real. O envio depende de rede e de uma central em operação. Se o Android encerrar o serviço, abra o Lume e configure novamente.',
                style: TextStyle(
                  color: ReservedPalette.muted,
                  fontSize: 12,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
