import 'package:flutter/material.dart';
import 'protection.dart';
import 'main.dart';

const voiceTriggerPhrases = <String, String>{
  'estrela_azul': 'minha estrela azul',
  'jardim_luz': 'o jardim precisa de luz',
  'janela_lua': 'a janela da lua',
};

class VoiceTriggerCard extends StatefulWidget {
  const VoiceTriggerCard({super.key, required this.protection});
  final ProtectionController protection;

  @override
  State<VoiceTriggerCard> createState() => _VoiceTriggerCardState();
}

class _VoiceTriggerCardState extends State<VoiceTriggerCard> {
  String? selectedPhraseId;

  String phraseId(ProtectionStatus s) =>
      selectedPhraseId ??
      (voiceTriggerPhrases.containsKey(s.voicePhraseId)
          ? s.voicePhraseId
          : 'estrela_azul');

  bool canEnable(ProtectionStatus s) =>
      s.voiceActivationAllowed && phraseId(s) == s.voicePhraseId;

  Future<void> beginTraining() async {
    if (!widget.protection.status.voiceTrainingAllowed) return;
    final selected = phraseId(widget.protection.status);
    final phrase = voiceTriggerPhrases[selected]!;
    final consent = await consentDialog(
      title: 'Treinar frase com o celular bloqueado',
      paragraphs: [
        'Este treino usa o microfone por até 90 segundos, sem enviar alertas ou áudio à central. O reconhecimento acontece no aparelho, sem internet. O áudio e as palavras reconhecidas ficam apenas na memória e são descartados.',
        'Depois de iniciar, aguarde o estado “Treino aberto” e bloqueie o celular com PIN, senha ou biometria. A tela pode permanecer apagada. Diga “$phrase”, faça uma pausa em silêncio de 1 a 2 segundos e repita a frase completa dentro de 12 segundos. As duas falas precisam acontecer com o celular bloqueado.',
        'O Android mostrará o uso do microfone. O treino interrompe a escuta real e termina ao aprovar, expirar ou ser cancelado. Depois, volte à área reservada e autentique-se para conferir. Um treino aprovado nunca ativa o alerta real automaticamente.',
      ],
      consentText: 'Autorizo usar o microfone localmente para este treino.',
      prefix: 'voice-training',
      confirmText: 'Iniciar treino de 90 segundos',
    );
    if (!mounted || !consent) return;
    if (!widget.protection.status.voiceTrainingAllowed) return;
    await widget.protection.call('beginVoiceTraining', {
      'phraseId': selected,
      'consent': true,
    });
  }

  Future<void> enableRealTrigger() async {
    if (!canEnable(widget.protection.status)) return;
    final selected = phraseId(widget.protection.status);
    final consent = await consentDialog(
      title: 'Ativar acionamento real por frase?',
      paragraphs: [
        'Com a escuta ativa, dizer “${voiceTriggerPhrases[selected]}”, pausar em silêncio por 1 a 2 segundos e repetir a frase completa dentro de 12 segundos cria um alerta REAL. Faça testes apenas no treino.',
        'O microfone ficará em uso contínuo, inclusive com o celular bloqueado e o app em segundo plano. O Android mantém sua notificação e indicador de microfone; o consumo de bateria aumenta. Você pode parar a escuta aqui ou pela notificação. Antes do alerta, o áudio e as palavras reconhecidas ficam só na memória do aparelho e não são gravados nem enviados. Durante o alerta, o áudio autorizado pode ser transmitido à central.',
        'Este recurso reconhece a frase, não a identidade de quem fala. Outra pessoa, uma gravação ou a TV repetindo a frase também podem acionar. A repetição reduz enganos, mas não elimina disparos acidentais. Escolha uma frase que não aparece nas suas conversas e faça o treino com a equipe.',
        'O envio depende de rede e de uma central em operação. Se o Android interromper o microfone ou encerrar o serviço, será preciso abrir o app e reativar. Depois de reiniciar, pausar o serviço ou acionar um alerta, a escuta não se liga sozinha.',
      ],
      consentText:
          'Autorizo a escuta local contínua para enviar alertas reais por esta frase.',
      prefix: 'voice-enable',
      confirmText: 'Ativar escuta para alerta real',
    );
    if (!mounted || !consent) return;
    final current = widget.protection.status;
    if (!canEnable(current) || phraseId(current) != selected) return;
    await widget.protection.call('enableVoiceTrigger', {'consent': true});
  }

  Future<bool> consentDialog({
    required String title,
    required List<String> paragraphs,
    required String consentText,
    required String prefix,
    required String confirmText,
  }) async {
    var accepted = false;
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, updateDialog) => AlertDialog(
          title: Text(title),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final text in paragraphs) ...[
                  Text(text),
                  const SizedBox(height: 14),
                ],
                CheckboxListTile(
                  key: ValueKey('$prefix-consent'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: accepted,
                  onChanged: (value) =>
                      updateDialog(() => accepted = value == true),
                  title: Text(consentText),
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
              key: ValueKey('$prefix-confirm'),
              onPressed: accepted
                  ? () => Navigator.pop(dialogContext, true)
                  : null,
              child: Text(confirmText),
            ),
          ],
        ),
      ),
    );
    return result == true;
  }

  String stateLabel(ProtectionStatus s) {
    if (!s.voiceAvailable) return 'Reconhecimento offline indisponível';
    if (s.voiceTraining == 'loading') return 'Preparando treino local…';
    if (s.voiceTraining == 'unlocked') {
      return 'Treino pendente · bloqueie o celular e repita';
    }
    if (s.voiceTrainingActive) {
      return s.voiceConfirmationPending
          ? 'Treino · aguardando a segunda fala'
          : 'Treino aberto · aguardando frase';
    }
    if (s.voiceTriggerReady) {
      if (s.voiceCooldownSeconds > 0) {
        return 'Escuta local ativa · intervalo de ${s.voiceCooldownSeconds} s';
      }
      return s.voiceConfirmationPending
          ? 'Primeira frase reconhecida · aguardando repetição'
          : 'Escuta local ativa para alerta real';
    }
    if (s.voiceError != null && s.voiceError!.isNotEmpty) {
      return 'Escuta indisponível · revise o recurso';
    }
    if (s.voiceEnabled) return 'Escuta real ainda não está pronta';
    if (s.voiceTraining == 'expired') return 'Prazo do treino encerrado';
    if (s.voiceTrainedLocked && phraseId(s) == s.voicePhraseId) {
      return 'Treino aprovado · ativação real pendente';
    }
    return 'Acionamento por frase desativado';
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.protection,
    builder: (context, _) {
      final c = widget.protection;
      final s = c.status;
      final selected = phraseId(s);
      final selectedProof = s.voiceTrainedLocked && selected == s.voicePhraseId;
      return Container(
        key: const ValueKey('voice-trigger-card'),
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
                Icon(Icons.record_voice_over_outlined, color: ink, size: 26),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Acionamento por frase opcional',
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
                key: const ValueKey('voice-state-label'),
                style: TextStyle(
                  color: s.voiceTriggerReady ? teal : const Color(0xFF9B6608),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Reconhece uma frase no aparelho, sem internet. Exige duas falas completas separadas por silêncio. O microfone permanece em uso enquanto a escuta estiver ativa; antes do alerta, o áudio e as palavras ficam só na memória e são descartados.',
              style: TextStyle(color: muted, fontSize: 12),
            ),
            const SizedBox(height: 18),
            DropdownButtonFormField<String>(
              key: ValueKey('voice-phrase-$selected'),
              initialValue: selected,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Frase de acionamento',
              ),
              items: [
                for (final entry in voiceTriggerPhrases.entries)
                  DropdownMenuItem(value: entry.key, child: Text(entry.value)),
              ],
              onChanged:
                  c.busy ||
                      !s.voiceAvailable ||
                      s.voiceEnabled ||
                      s.voiceTrainingActive
                  ? null
                  : (value) => setState(() => selectedPhraseId = value),
            ),
            const SizedBox(height: 12),
            Text(
              '1. Diga “${voiceTriggerPhrases[selected]}”.\n2. Faça uma pausa em silêncio de 1 a 2 segundos.\n3. Repita a frase completa dentro de 12 segundos.',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            _proof(
              'Treino no bloqueio para esta frase',
              selectedProof
                  ? 'Aprovado neste aparelho'
                  : 'Pendente · bloqueie o celular durante o treino',
              selectedProof,
            ),
            if (!s.voiceAvailable) ...[
              const SizedBox(height: 8),
              const Text(
                'Este aplicativo não confirmou o modelo de voz offline. A escuta e o acionamento por frase permanecem indisponíveis.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
            if (!s.consentAudio || !s.permissionsGranted || !s.armed) ...[
              const SizedBox(height: 8),
              const Text(
                'Para treinar, ative a proteção, autorize o áudio no vínculo e conceda as permissões do aparelho. O celular precisa ter bloqueio seguro configurado.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
            if (s.physicalTrainingActive) ...[
              const SizedBox(height: 8),
              const Text(
                'Termine ou cancele o treino dos botões antes de treinar a frase.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
            if (s.voiceTrainingActive) ...[
              const SizedBox(height: 12),
              Text(
                s.voiceTraining == 'loading'
                    ? 'Preparando o reconhecimento no aparelho. Aguarde o treino ficar pronto antes de bloquear e falar.'
                    : 'Treino de até 90 segundos: bloqueie o celular e diga a frase duas vezes, com pausa em silêncio de 1 a 2 segundos. A tela pode permanecer apagada. Depois, volte e autentique-se para conferir o resultado. Este treino não envia alerta.',
                style: const TextStyle(color: muted, fontSize: 12),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                key: const ValueKey('voice-cancel-training'),
                onPressed: c.busy ? null : () => c.call('cancelVoiceTraining'),
                child: const Text('Cancelar treino de frase'),
              ),
            ],
            if (s.voiceError != null && s.voiceError!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                s.voiceError!,
                style: const TextStyle(color: muted, fontSize: 12),
              ),
            ],
            if (s.hasIncident) ...[
              const SizedBox(height: 12),
              const Text(
                'Durante a ocorrência, a escuta da frase fica desligada. A transmissão autorizada de áudio segue o estado do compartilhamento. Treine ou reative a frase depois do encerramento pela equipe.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
            if (s.voiceCooldownSeconds > 0) ...[
              const SizedBox(height: 12),
              Text(
                'Intervalo de proteção: ${s.voiceCooldownSeconds} segundo(s). Nenhum novo acionamento por frase acontece nesse intervalo.',
                style: const TextStyle(color: muted, fontSize: 12),
              ),
            ],
            const SizedBox(height: 18),
            if (!s.voiceTrainingActive)
              OutlinedButton.icon(
                key: const ValueKey('voice-begin-training'),
                onPressed: c.busy || !s.voiceTrainingAllowed
                    ? null
                    : beginTraining,
                icon: const Icon(Icons.fact_check_outlined),
                label: Text(
                  selectedProof
                      ? 'Refazer treino de frase'
                      : 'Treinar frase no bloqueio',
                ),
              ),
            const SizedBox(height: 10),
            if (s.voiceEnabled)
              OutlinedButton.icon(
                key: const ValueKey('voice-disable'),
                onPressed: c.busy ? null : () => c.call('disableVoiceTrigger'),
                icon: const Icon(Icons.mic_off_outlined),
                label: const Text('Desativar escuta real'),
              )
            else
              FilledButton.icon(
                key: const ValueKey('voice-enable'),
                onPressed: c.busy || !canEnable(s) ? null : enableRealTrigger,
                icon: const Icon(Icons.mic_none_outlined),
                label: const Text('Ativar escuta para alerta real'),
              ),
            const SizedBox(height: 14),
            const Text(
              'Não reconhece a identidade da voz: TV, gravações e outras pessoas repetindo a frase podem acionar. Use uma frase pouco comum no seu dia a dia. Ruído, distância, economia de bateria e outros apps usando o microfone podem impedir o reconhecimento; valide no seu aparelho com a equipe.',
              style: TextStyle(color: muted, fontSize: 11),
            ),
            const SizedBox(height: 9),
            const Text(
              'Após ativar com o app aberto, a escuta pode continuar com a tela apagada e o app em segundo plano enquanto o Android mantiver o serviço e o microfone ativos. A notificação e o indicador de microfone permanecem visíveis. Ao pausar, reiniciar ou acionar um alerta, reative na área reservada quando desejar.',
              style: TextStyle(color: muted, fontSize: 11),
            ),
          ],
        ),
      );
    },
  );

  Widget _proof(String title, String detail, bool verified) => Row(
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
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 3),
            Text(detail, style: const TextStyle(color: muted, fontSize: 11)),
          ],
        ),
      ),
    ],
  );
}
