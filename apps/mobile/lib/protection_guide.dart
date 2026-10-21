import 'package:flutter/material.dart';
import 'reserved_identity.dart';

/// Silent, illustrative help. This widget has no access to protection commands.
class ProtectionGuide extends StatefulWidget {
  const ProtectionGuide({super.key});

  @override
  State<ProtectionGuide> createState() => _ProtectionGuideState();
}

class _ProtectionGuideState extends State<ProtectionGuide> {
  int step = 0;
  final scroll = ScrollController();

  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  void move(int value) {
    setState(() => step = value);
    if (scroll.hasClients) scroll.jumpTo(0);
  }

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    final page = _pages[step];
    return Dialog.fullscreen(
      key: const ValueKey('protection-guide'),
      backgroundColor: ReservedPalette.paper,
      child: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 8, 12, 8),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Guia de proteção',
                          style: TextStyle(
                            color: ReservedPalette.plum,
                            fontWeight: FontWeight.w600,
                            fontSize: 17,
                          ),
                        ),
                      ),
                      IconButton(
                        key: const ValueKey('guide-close'),
                        tooltip: 'Fechar guia',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Semantics(
                    label: 'Etapa ${step + 1} de ${_pages.length}',
                    child: ExcludeSemantics(
                      child: Row(
                        children: List.generate(
                          _pages.length,
                          (index) => Expanded(
                            child: AnimatedContainer(
                              duration: reducedMotion
                                  ? Duration.zero
                                  : const Duration(milliseconds: 220),
                              margin: EdgeInsets.only(
                                right: index == _pages.length - 1 ? 0 : 6,
                              ),
                              height: 4,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(4),
                                color: index <= step
                                    ? ReservedPalette.plum
                                    : ReservedPalette.line,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    key: const ValueKey('guide-scroll'),
                    controller: scroll,
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
                    child: AnimatedSwitcher(
                      duration: reducedMotion
                          ? Duration.zero
                          : const Duration(milliseconds: 260),
                      switchInCurve: Curves.easeOutCubic,
                      // Old steps do not remain in semantics or hit testing.
                      layoutBuilder: (current, previous) =>
                          current ?? const SizedBox.shrink(),
                      transitionBuilder: (child, animation) => FadeTransition(
                        opacity: animation,
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: const Offset(0, .025),
                            end: Offset.zero,
                          ).animate(animation),
                          child: child,
                        ),
                      ),
                      child: Column(
                        key: ValueKey('guide-step-$step'),
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _GuideIllustration(step: step),
                          const SizedBox(height: 26),
                          Text(
                            '${step + 1} / ${_pages.length}  ·  ${page.eyebrow}',
                            style: const TextStyle(
                              color: ReservedPalette.plum,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Semantics(
                            header: true,
                            liveRegion: true,
                            child: Text(
                              page.title,
                              style: const TextStyle(
                                fontSize: 28,
                                fontWeight: FontWeight.w600,
                                height: 1.2,
                                letterSpacing: -.6,
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            page.intro,
                            style: const TextStyle(
                              color: ReservedPalette.muted,
                              fontSize: 15,
                              height: 1.6,
                            ),
                          ),
                          const SizedBox(height: 20),
                          ReservedSectionCard(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                for (
                                  var index = 0;
                                  index < page.details.length;
                                  index++
                                ) ...[
                                  if (index > 0) const SizedBox(height: 16),
                                  _GuideDetail(
                                    icon: page.details[index].$1,
                                    text: page.details[index].$2,
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 18),
                          Text(
                            page.note,
                            style: const TextStyle(
                              color: ReservedPalette.muted,
                              fontSize: 12,
                              height: 1.6,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.fromLTRB(24, 14, 24, 12),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    border: Border(
                      top: BorderSide(color: ReservedPalette.line),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      FilledButton(
                        key: const ValueKey('guide-next'),
                        onPressed: step == _pages.length - 1
                            ? () => Navigator.pop(context)
                            : () => move(step + 1),
                        child: Text(
                          step == _pages.length - 1
                              ? 'Concluir guia'
                              : 'Continuar',
                        ),
                      ),
                      const SizedBox(height: 4),
                      Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        spacing: 12,
                        children: [
                          if (step > 0)
                            TextButton(
                              key: const ValueKey('guide-back'),
                              onPressed: () => move(step - 1),
                              child: const Text('Voltar'),
                            ),
                          TextButton(
                            key: const ValueKey('guide-skip'),
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Agora não'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GuideDetail extends StatelessWidget {
  const _GuideDetail({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      ExcludeSemantics(
        child: Icon(icon, color: ReservedPalette.tealInk, size: 22),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Text(text, style: const TextStyle(fontSize: 14, height: 1.55)),
      ),
    ],
  );
}

class _GuideIllustration extends StatelessWidget {
  const _GuideIllustration({required this.step});
  final int step;

  @override
  Widget build(BuildContext context) => step == 2
      ? const _VolumeLesson()
      : ExcludeSemantics(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 22),
            decoration: BoxDecoration(
              color: ReservedPalette.lavender,
              borderRadius: BorderRadius.circular(28),
            ),
            child: switch (step) {
              0 => const Image(
                image: AssetImage('assets/reserved/sos-emblem-v3.png'),
                height: 132,
                fit: BoxFit.contain,
              ),
              1 => const Wrap(
                alignment: WrapAlignment.center,
                spacing: 16,
                runSpacing: 12,
                children: [
                  _VisualToken(icon: Icons.link, label: 'Vínculo'),
                  _VisualToken(icon: Icons.tune, label: 'Escolhas'),
                  _VisualToken(icon: Icons.shield_outlined, label: 'Treino'),
                ],
              ),
              3 => const Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 14,
                runSpacing: 12,
                children: [
                  _VisualToken(icon: Icons.graphic_eq, label: 'Sua frase'),
                  Text('1–2 s\nde silêncio', textAlign: TextAlign.center),
                  _VisualToken(icon: Icons.graphic_eq, label: 'Repita'),
                ],
              ),
              _ => const Wrap(
                alignment: WrapAlignment.center,
                spacing: 16,
                runSpacing: 12,
                children: [
                  _VisualToken(icon: Icons.phone_android, label: 'Aparelho'),
                  _VisualToken(
                    icon: Icons.cloud_done_outlined,
                    label: 'Servidor',
                  ),
                  _VisualToken(icon: Icons.support_agent, label: 'Equipe'),
                ],
              ),
            },
          ),
        );
}

class _VisualToken extends StatelessWidget {
  const _VisualToken({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: ReservedPalette.plum, size: 30),
      ),
      const SizedBox(height: 8),
      Text(
        label,
        style: const TextStyle(color: ReservedPalette.plum, fontSize: 12),
      ),
    ],
  );
}

class _VolumeToken extends StatelessWidget {
  const _VolumeToken({required this.label, this.detail, this.active = false});
  final String label;
  final String? detail;
  final bool active;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
    duration: MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 140),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    decoration: BoxDecoration(
      color: active ? ReservedPalette.plum : Colors.white,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            color: active ? Colors.white : ReservedPalette.plum,
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (detail != null)
          Text(
            detail!,
            style: TextStyle(
              color: active ? Colors.white : ReservedPalette.muted,
              fontSize: 10,
            ),
          ),
      ],
    ),
  );
}

class _VolumeLesson extends StatefulWidget {
  const _VolumeLesson();

  @override
  State<_VolumeLesson> createState() => _VolumeLessonState();
}

class _VolumeLessonState extends State<_VolumeLesson>
    with SingleTickerProviderStateMixin {
  late final animation = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 5500),
  );

  @override
  void dispose() {
    animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: ReservedPalette.lavender,
        borderRadius: BorderRadius.circular(28),
      ),
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          final elapsed = animation.value * 5500;
          final phase = !animation.isAnimating || reducedMotion
              ? -1
              : elapsed < 650
              ? 0
              : elapsed < 1300
              ? 1
              : elapsed < 1950
              ? 2
              : elapsed < 5050
              ? 3
              : 4;
          final caption = switch (phase) {
            0 => '1 · Toque BAIXAR e solte',
            1 => '2 · Toque SUBIR e solte',
            2 => '3 · Toque BAIXAR e solte',
            3 => '4 · Mantenha SUBIR por 3 segundos…',
            4 => 'Agora SOLTE o botão SUBIR',
            _ => 'Toques curtos. Na última subida, segure e solte.',
          };
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ExcludeSemantics(
                child: Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _VolumeToken(label: '1 · ↓', active: phase == 0),
                    _VolumeToken(label: '2 · ↑', active: phase == 1),
                    _VolumeToken(label: '3 · ↓', active: phase == 2),
                    _VolumeToken(
                      label: '4 · ↑',
                      detail: '2–4 s e solte',
                      active: phase == 3 || phase == 4,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Text(
                caption,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: ReservedPalette.plum,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
              ),
              if (!reducedMotion) ...[
                const SizedBox(height: 8),
                TextButton.icon(
                  key: const ValueKey('guide-play-volume'),
                  onPressed: animation.isAnimating
                      ? null
                      : () => animation.forward(from: 0),
                  icon: const Icon(Icons.play_circle_outline),
                  label: const Text('Ver sequência'),
                ),
                const Text(
                  'Demonstração silenciosa. Não envia alertas.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: ReservedPalette.muted, fontSize: 10),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _GuidePage {
  const _GuidePage(
    this.eyebrow,
    this.title,
    this.intro,
    this.details,
    this.note,
  );
  final String eyebrow;
  final String title;
  final String intro;
  final List<(IconData, String)> details;
  final String note;
}

const _pages = [
  _GuidePage(
    'NO SEU TEMPO',
    'Você mantém o controle.',
    'Este espaço reúne suas escolhas de proteção. Você pode conhecer o guia agora ou fechar e voltar quando estiver em segurança.',
    [
      (
        Icons.lock_outline,
        'A área reservada exige a autenticação do aparelho. Ao sair ou bloquear o celular, ela se fecha e o Lume volta a ser um navegador.',
      ),
      (
        Icons.touch_app_outlined,
        'O guia não ativa a proteção, não concede permissões e não envia alertas. Você decide cada etapa.',
      ),
      (
        Icons.help_outline,
        'O botão “Guia de proteção” fica na parte superior da área reservada para consultar quando quiser.',
      ),
    ],
    'Este guia aparece nos três primeiros acessos reservados disponíveis para apresentação. Em uma ocorrência aberta, o atendimento tem prioridade.',
  ),
  _GuidePage(
    'PREPARE COM A EQUIPE',
    'Um vínculo, suas escolhas.',
    'A equipe cadastra você e entrega um código de uso único. Informe o endereço da central e o código somente na área reservada.',
    [
      (
        Icons.location_on_outlined,
        'Autorize a localização para orientar o atendimento. O envio ocorre durante um alerta acionado neste aparelho.',
      ),
      (
        Icons.mic_none_outlined,
        'Transmitir áudio à central é opcional e exige seu consentimento. A equipe não pode ligar o microfone à distância.',
      ),
      (
        Icons.notifications_none,
        'Revise as permissões e ative o serviço com o app aberto. O Android mantém a notificação e os indicadores de uso.',
      ),
    ],
    '“Serviço ativo” não confirma conexão nem atendimento. Faça um teste simulado com a equipe antes de depender do aparelho em uma emergência.',
  ),
  _GuidePage(
    'ATALHO OPCIONAL · VOLUME',
    'Uma sequência intencional.',
    'Com o celular bloqueado e a tela acesa: BAIXAR volume → SUBIR → BAIXAR → segurar SUBIR por 2–4 segundos e SOLTAR.',
    [
      (
        Icons.timer_outlined,
        'Faça os três primeiros toques em até 1 segundo cada, com no máximo 1,5 segundo entre eles. Complete a sequência em até 10 segundos.',
      ),
      (
        Icons.phonelink_lock,
        'Se a tela estiver apagada, pressione Power uma vez para acendê-la, sem desbloquear. Não use sequências repetidas de Power.',
      ),
      (
        Icons.accessibility_new,
        'Habilite o atalho nas configurações do Android e conclua o treino de 90 segundos com o aparelho bloqueado. O treino não envia ocorrências.',
      ),
      (
        Icons.check_circle_outline,
        'Depois do treino, autorize separadamente o uso real. Ordem errada, tempo fora do limite ou sequência incompleta são descartados.',
      ),
    ],
    'O volume do sistema continua mudando. Há um intervalo de 30 segundos entre acionamentos. Tela bloqueada e economia de bateria precisam ser testadas neste modelo de celular.',
  ),
  _GuidePage(
    'ATALHO OPCIONAL · VOZ',
    'Sua frase, duas vezes.',
    'Diga sua frase completa, faça 1–2 segundos de silêncio e repita a frase completa em até 12 segundos. Uma única fala não basta.',
    [
      (
        Icons.mic_none_outlined,
        'Escolha uma das frases disponíveis e autorize o microfone local. A escuta precisa ser iniciada com o app aberto; o Android mantém seu indicador de microfone.',
      ),
      (
        Icons.phonelink_lock,
        'Conclua o treino de 90 segundos com o celular bloqueado e a tela apagada. Depois, ative separadamente a escuta para alerta real com o app aberto e aguarde o estado de escuta ativa antes de bloquear.',
      ),
      (
        Icons.privacy_tip_outlined,
        'O reconhecimento é offline. Antes do alerta, áudio e texto ficam em memória no aparelho. O envio de áudio à central segue sua autorização de transmissão.',
      ),
    ],
    'Depende da disponibilidade do reconhecimento e do modelo do aparelho. TV ou gravações repetindo a frase podem acionar; os filtros não eliminam todos os disparos acidentais.',
  ),
  _GuidePage(
    'DURANTE UM ALERTA',
    'Acompanhe cada confirmação.',
    'Se precisar de ajuda agora, mantenha o botão de alerta real pressionado por 3 segundos. Um teste simulado é identificado como SIMULADO e não substitui o pedido real.',
    [
      (
        Icons.phone_android,
        '“Salvo no aparelho” significa que o envio pode estar pendente. “Servidor recebeu” confirma a entrega técnica, ainda sem confirmar atendimento humano.',
      ),
      (
        Icons.support_agent,
        'O reconhecimento por um operador e a atribuição de responsável são estados distintos. Acompanhe as orientações da sua equipe.',
      ),
      (
        Icons.pause_circle_outline,
        '“Interromper compartilhamento” para novas capturas de localização, áudio e escuta por voz. O atalho físico permanece configurado, o alerta continua aberto na central e os dados já capturados continuam na fila.',
      ),
    ],
    'O envio depende de rede e de uma central em operação. Em perigo imediato, use também os canais de emergência disponíveis. Você pode fechar este guia a qualquer momento.',
  ),
];
