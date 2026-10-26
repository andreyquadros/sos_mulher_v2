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
      ? const _FloatingLesson()
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
                spacing: 16,
                runSpacing: 12,
                children: [
                  _VisualToken(icon: Icons.lock_outline, label: 'Desbloqueie'),
                  _VisualToken(
                    icon: Icons.explore_outlined,
                    label: 'Botão Lume',
                  ),
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

class _FloatingLesson extends StatefulWidget {
  const _FloatingLesson();

  @override
  State<_FloatingLesson> createState() => _FloatingLessonState();
}

class _FloatingLessonState extends State<_FloatingLesson>
    with SingleTickerProviderStateMixin {
  late final animation = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 5),
    animationBehavior: AnimationBehavior.preserve,
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
        builder: (context, _) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ExcludeSemantics(
              child: _VisualToken(
                icon: Icons.explore_outlined,
                label: 'Botão Lume',
              ),
            ),
            const SizedBox(height: 18),
            Text(
              animation.isCompleted
                  ? '5 segundos completos. O alerta pode ser enviado.'
                  : animation.isAnimating && !reducedMotion
                  ? 'Mantenha pressionado: ${(5 * (1 - animation.value)).ceil().clamp(1, 5)} s'
                  : 'Pressione → segure 5 segundos → alerta',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: ReservedPalette.plum,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Solte antes dos 5 segundos para cancelar.',
              textAlign: TextAlign.center,
              style: TextStyle(color: ReservedPalette.muted, fontSize: 12),
            ),
            if (!reducedMotion) ...[
              const SizedBox(height: 8),
              TextButton.icon(
                key: const ValueKey('guide-play-floating'),
                onPressed: animation.isAnimating
                    ? null
                    : () => animation.forward(from: 0),
                icon: const Icon(Icons.play_circle_outline),
                label: const Text('Ver os 5 segundos'),
              ),
            ],
            const Text(
              'Ilustração silenciosa. Não ativa nem envia alertas.',
              textAlign: TextAlign.center,
              style: TextStyle(color: ReservedPalette.muted, fontSize: 10),
            ),
          ],
        ),
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
    'SEU ATALHO PRINCIPAL',
    'Segure o botão Lume por 5 segundos.',
    'Um pequeno botão com símbolo de navegador fica sobre os outros aplicativos. Você não precisa abrir a área reservada para acionar depois de prepará-lo.',
    [
      (
        Icons.open_in_new,
        'Na área reservada, permita “Exibir sobre outros apps” nos ajustes do Android. Depois, volte à área reservada para continuar.',
      ),
      (
        Icons.touch_app_outlined,
        'Faça o treino local: segure o botão flutuante sem mover por 5 segundos. O treino não envia alerta. Depois, habilite separadamente o uso real.',
      ),
      (
        Icons.timer_outlined,
        'Com o uso real habilitado, segure por 5 segundos completos. Soltar antes ou arrastar cancela a contagem. Arrastar muda apenas a posição do botão.',
      ),
    ],
    'O botão precisa do vínculo e do serviço ativo. Pausar o serviço remove o botão. O recebimento só é confirmado após a resposta da central.',
  ),
  _GuidePage(
    'TELA BLOQUEADA E ALTERNATIVAS',
    'Desbloqueie para usar o botão.',
    'O botão flutuante é ocultado quando a tela apaga ou o celular é bloqueado. Ele aparece durante o uso normal do celular desbloqueado.',
    [
      (
        Icons.lock_outline,
        'Se estiver bloqueado, desbloqueie antes de segurar o botão. Ele não substitui a tela de bloqueio nem aparece sobre ela.',
      ),
      (
        Icons.tune,
        'Botões físicos e frase de voz continuam em “Outros atalhos opcionais”. Cada alternativa tem suas próprias permissões, treino e limitações.',
      ),
      (
        Icons.battery_saver,
        'Se o Android encerrar o serviço, abra o Lume e ative novamente. Faça os testes neste modelo de celular com a equipe.',
      ),
    ],
    'O botão Lume não exige acessibilidade nem escuta por voz. A notificação e os indicadores de uso do Android permanecem visíveis.',
  ),
  _GuidePage(
    'DURANTE UM ALERTA',
    'Acompanhe cada confirmação.',
    'Se precisar de ajuda agora, mantenha o botão de alerta real pressionado por 5 segundos. Um teste simulado é identificado como SIMULADO e não substitui o pedido real.',
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
