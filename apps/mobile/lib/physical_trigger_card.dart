import 'package:flutter/material.dart';
import 'main.dart';
import 'protection.dart';

/// Optional hardware-key setup. This widget never creates an incident or arms
/// capture; the native service is the authority for training and readiness.
class PhysicalTriggerCard extends StatefulWidget {
  const PhysicalTriggerCard({super.key, required this.protection});
  final ProtectionController protection;

  @override
  State<PhysicalTriggerCard> createState() => _PhysicalTriggerCardState();
}

class _PhysicalTriggerCardState extends State<PhysicalTriggerCard> {
  Future<void> openSettings() async {
    var accepted = false;
    final consent = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, updateDialog) => AlertDialog(
          title: const Text('Acessibilidade para teclas de volume'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Este recurso é opcional. O Lume usa um serviço de acessibilidade apenas para reconhecer a sequência das teclas de volume. Não lê textos, mensagens, senhas ou conteúdo da tela.',
                ),
                const SizedBox(height: 14),
                const Text(
                  'O Android mostrará suas próprias configurações e avisos de acessibilidade. Ative o serviço do Lume somente se concordar. Abrir essas configurações não habilita o envio de alertas por volume.',
                ),
                const SizedBox(height: 14),
                const Text(
                  'A área reservada será fechada ao sair do app. Quando voltar, autentique-se novamente, faça o treino com o celular bloqueado e escolha se quer ativar o atalho real.',
                ),
                CheckboxListTile(
                  key: const ValueKey('physical-settings-consent'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: accepted,
                  onChanged: (value) =>
                      updateDialog(() => accepted = value == true),
                  title: const Text(
                    'Entendi e autorizo este uso das teclas de volume.',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Agora não'),
            ),
            FilledButton(
              key: const ValueKey('physical-settings-confirm'),
              onPressed: accepted
                  ? () => Navigator.pop(dialogContext, true)
                  : null,
              child: const Text('Abrir configurações do Android'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || consent != true) return;
    await widget.protection.call('physicalSettings', {'consent': true});
  }

  Future<void> beginTraining() async {
    final status = widget.protection.status;
    if (!status.physicalConnected ||
        status.physicalConflict ||
        status.hasIncident) {
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Treinar com o celular bloqueado'),
        content: const SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'O treino dura até 90 segundos e desativa o atalho real. Ele não envia alertas nem inicia captura de localização ou áudio.',
              ),
              SizedBox(height: 14),
              Text(
                'Depois de iniciar, bloqueie o celular. Se a tela estiver apagada, pressione liga/desliga uma vez para acender, sem desbloquear. Não pressione esse botão repetidamente.',
              ),
              SizedBox(height: 14),
              Text(
                'Faça: BAIXAR clique → SUBIR clique → BAIXAR clique → SUBIR segurar de 2 a 4 segundos e SOLTAR. Os três cliques duram até 1 segundo cada; o intervalo entre passos é de até 1,5 segundo e o total, até 10 segundos.',
              ),
              SizedBox(height: 14),
              Text(
                'A área reservada fecha quando você bloqueia ou sai do app. Depois da sequência, volte ao Lume e autentique-se novamente para conferir o resultado. Um treino aprovado nunca ativa o atalho automaticamente.',
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const ValueKey('physical-training-confirm'),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Iniciar treino de 90 segundos'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    final current = widget.protection.status;
    if (!current.physicalConnected ||
        current.physicalConflict ||
        current.hasIncident) {
      return;
    }
    await widget.protection.call('beginPhysicalTraining');
  }

  Future<void> enableRealTrigger() async {
    if (!widget.protection.status.physicalActivationAllowed) return;
    var accepted = false;
    final consent = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, updateDialog) => AlertDialog(
          title: const Text('Ativar acionamento físico real?'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'O treino com o celular bloqueado foi aprovado neste aparelho. Se você ativar, a sequência de volume passará a criar um alerta REAL. Não é mais um treino.',
                ),
                const SizedBox(height: 14),
                const Text(
                  'O envio depende de conexão. A sessão ativa permite compartilhar localização e, se autorizado, áudio. Com a tela apagada, acenda-a com um único toque em liga/desliga, sem desbloquear, antes da sequência.',
                ),
                CheckboxListTile(
                  key: const ValueKey('physical-enable-consent'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: accepted,
                  onChanged: (value) =>
                      updateDialog(() => accepted = value == true),
                  title: const Text(
                    'Quero ativar a sequência para enviar um alerta real.',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Manter desativado'),
            ),
            FilledButton(
              key: const ValueKey('physical-enable-confirm'),
              onPressed: accepted
                  ? () => Navigator.pop(dialogContext, true)
                  : null,
              child: const Text('Ativar atalho real'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || consent != true) return;
    // Re-check after the dialog: connection, session or proof may have changed.
    if (!widget.protection.status.physicalActivationAllowed) return;
    await widget.protection.call('enablePhysicalTrigger', {'consent': true});
  }

  String stateLabel(ProtectionStatus s) {
    if (s.physicalConflict) {
      return 'Atalho indisponível · conflito de acessibilidade';
    }
    if (s.physicalTraining == 'unlocked') {
      return 'Ainda falta treinar com o celular bloqueado';
    }
    if (s.physicalTrainingActive) return 'Treino aberto · aguardando sequência';
    if (s.physicalTriggerReady) {
      return s.physicalCooldownSeconds > 0
          ? 'Atalho ativo · intervalo de ${s.physicalCooldownSeconds} s'
          : 'Atalho físico pronto neste aparelho';
    }
    if (s.physicalEnabled) {
      if (!s.physicalTrainedLocked) return 'Novo treino bloqueado necessário';
      if (!s.physicalConnected) return 'Acessibilidade desconectada';
      if (!s.armed) return 'Atalho ativo · reative a sessão';
      return 'Prontidão do atalho não confirmada';
    }
    if (s.physicalTraining == 'expired') return 'Prazo do treino encerrado';
    if (s.physicalTrainedLocked) return 'Treino aprovado · ativação pendente';
    return 'Atalho físico desativado';
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.protection,
    builder: (context, _) {
      final c = widget.protection;
      final s = c.status;
      return Container(
        key: const ValueKey('physical-trigger-card'),
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.volume_up_outlined, color: ink, size: 26),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Acionamento físico opcional',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Semantics(
              liveRegion: true,
              child: Text(
                stateLabel(s),
                key: const ValueKey('physical-state-label'),
                style: TextStyle(
                  color: s.physicalTriggerReady
                      ? teal
                      : const Color(0xFF9B6608),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Usa apenas as teclas de volume pelo serviço de acessibilidade, sem ler o conteúdo da tela. A sequência não bloqueia o controle normal de volume e pode alterá-lo.',
              style: TextStyle(color: muted, fontSize: 12),
            ),
            const SizedBox(height: 18),
            _proof(
              'Acessibilidade do Lume',
              s.physicalConnected ? 'Conectada ao Android' : 'Não conectada',
              s.physicalConnected,
            ),
            _proof(
              'Treino obrigatório no bloqueio',
              s.physicalTrainedLocked
                  ? 'Aprovado neste aparelho'
                  : 'Pendente · precisa ser feito com o celular bloqueado',
              s.physicalTrainedLocked,
            ),
            if (s.physicalConflict) ...[
              const SizedBox(height: 12),
              const Text(
                'Outro serviço de acessibilidade está usando o filtro de teclas. O atalho por volume não está pronto. Mantenha TalkBack e outros recursos essenciais; use a notificação do Lume para abrir a confirmação de 3 segundos e peça orientação à equipe.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
            const SizedBox(height: 12),
            const Text(
              'Se a tela estiver apagada, pressione liga/desliga uma vez para acender, sem desbloquear. Depois faça a sequência. Não use pressões repetidas no botão liga/desliga.',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 14),
            _step('1', 'BAIXAR', 'Clique e solte.'),
            _step('2', 'SUBIR', 'Clique e solte.'),
            _step('3', 'BAIXAR', 'Clique e solte.'),
            _step('4', 'SUBIR', 'Segure de 2 a 4 segundos e SOLTE.'),
            const SizedBox(height: 9),
            const Text(
              'Cada clique: até 1 s. Intervalo entre passos: até 1,5 s. Sequência inteira: até 10 s. Após um acionamento, aguarde 30 s antes de repetir.',
              style: TextStyle(color: muted, fontSize: 11),
            ),
            if (s.physicalCooldownSeconds > 0) ...[
              const SizedBox(height: 12),
              Text(
                'Intervalo de proteção: ${s.physicalCooldownSeconds} segundo(s). A sequência não envia outro alerta nesse intervalo.',
                style: const TextStyle(color: muted, fontSize: 12),
              ),
            ],
            if (s.physicalTrainingActive) ...[
              const SizedBox(height: 16),
              Text(
                s.physicalTraining == 'unlocked'
                    ? 'A sequência foi feita sem bloqueio e não aprovou o treino obrigatório. Bloqueie o celular, acenda a tela sem desbloquear e repita dentro da janela de 90 segundos.'
                    : 'Aguardando dentro da janela de 90 segundos. Bloqueie o celular e execute a sequência com a tela acesa, sem desbloquear. Nenhum alerta é enviado e nenhum sensor é iniciado por este treino.',
                style: const TextStyle(fontSize: 12, color: muted),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                key: const ValueKey('physical-cancel-training'),
                onPressed: c.busy
                    ? null
                    : () => c.call('cancelPhysicalTraining'),
                child: const Text('Cancelar treino'),
              ),
            ],
            if (s.physicalTraining == 'expired') ...[
              const SizedBox(height: 12),
              const Text(
                'O treino expirou sem ativar o atalho real. Inicie outro quando puder bloquear o celular e realizar a sequência.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
            if (!s.physicalEnabled && !s.armed) ...[
              const SizedBox(height: 14),
              const Text(
                'Antes de ativar o atalho real, ative a proteção neste aparelho pelo botão acima. O treino aprovado não inicia a sessão nem as capturas.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
            if (s.physicalEnabled && !s.armed) ...[
              const SizedBox(height: 14),
              const Text(
                'A sequência ainda pode enviar um alerta quando a acessibilidade e a prova estiverem válidas. Reative a sessão para localização e áudio. O atalho ativo sozinho não confirma coleta, conexão ou atendimento.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
            const SizedBox(height: 18),
            OutlinedButton.icon(
              key: const ValueKey('physical-open-settings'),
              onPressed: c.busy || s.physicalTrainingActive
                  ? null
                  : openSettings,
              icon: const Icon(Icons.accessibility_new_outlined),
              label: const Text('Configurar acessibilidade'),
            ),
            const SizedBox(height: 10),
            if (!s.physicalTrainingActive)
              OutlinedButton.icon(
                key: const ValueKey('physical-begin-training'),
                onPressed:
                    c.busy ||
                        !s.physicalConnected ||
                        s.physicalConflict ||
                        s.hasIncident
                    ? null
                    : beginTraining,
                icon: const Icon(Icons.fact_check_outlined),
                label: Text(
                  s.physicalTrainedLocked
                      ? 'Refazer treino seguro'
                      : 'Treinar com celular bloqueado',
                ),
              ),
            if (s.hasIncident) ...[
              const SizedBox(height: 8),
              const Text(
                'Há uma ocorrência aberta. O treino fica disponível após o encerramento pela equipe.',
                style: TextStyle(color: muted, fontSize: 11),
              ),
            ],
            const SizedBox(height: 10),
            if (s.physicalEnabled)
              OutlinedButton.icon(
                key: const ValueKey('physical-disable'),
                onPressed: c.busy
                    ? null
                    : () => c.call('disablePhysicalTrigger'),
                icon: const Icon(Icons.volume_off_outlined),
                label: const Text('Desativar atalho real'),
              )
            else
              FilledButton.icon(
                key: const ValueKey('physical-enable'),
                onPressed: c.busy || !s.physicalActivationAllowed
                    ? null
                    : enableRealTrigger,
                icon: const Icon(Icons.shield_outlined),
                label: const Text('Ativar atalho real'),
              ),
            const SizedBox(height: 14),
            const Text(
              'A configuração e o treino são etapas separadas da ativação real. Ao voltar das configurações ou do bloqueio, abra a área reservada e autentique-se novamente para conferir o resultado e escolher a ativação.',
              style: TextStyle(color: muted, fontSize: 11),
            ),
            const SizedBox(height: 9),
            const Text(
              'O treino valida o celular bloqueado com a tela acesa. Não há funcionamento universal: reiniciar ou atualizar o Android exige novo treino, e fabricantes ou economia de bateria podem interferir.',
              style: TextStyle(color: muted, fontSize: 11),
            ),
          ],
        ),
      );
    },
  );

  Widget _step(String number, String keyLabel, String instruction) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 26,
          child: Text(
            number,
            style: const TextStyle(color: muted, fontSize: 12),
          ),
        ),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '$keyLabel · ',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                TextSpan(text: instruction),
              ],
            ),
            style: const TextStyle(fontSize: 12),
          ),
        ),
      ],
    ),
  );

  Widget _proof(String title, String detail, bool verified) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          verified ? Icons.check_circle_outline : Icons.radio_button_unchecked,
          color: verified ? teal : const Color(0xFF9B6608),
          size: 19,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 3),
              Text(detail, style: const TextStyle(color: muted, fontSize: 11)),
            ],
          ),
        ),
      ],
    ),
  );
}
