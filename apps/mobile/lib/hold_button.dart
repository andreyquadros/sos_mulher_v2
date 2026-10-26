import 'dart:async';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'main.dart';

class HoldButton extends StatefulWidget {
  const HoldButton({
    super.key,
    required this.label,
    required this.color,
    required this.enabled,
    required this.onConfirmed,
  });
  static const holdDuration = Duration(seconds: 5);
  final String label;
  final Color color;
  final bool enabled;
  final Future<Object?> Function() onConfirmed;
  @override
  State<HoldButton> createState() => _HoldButtonState();
}

class _HoldButtonState extends State<HoldButton>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController progress = AnimationController(
    vsync: this,
    duration: HoldButton.holdDuration,
    animationBehavior: AnimationBehavior.preserve,
  );
  Timer? deadline;
  bool holding = false;
  int? pointer;
  Offset? origin;
  final Set<int> pointers = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didUpdateWidget(HoldButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.enabled) cancel();
  }

  void begin() {
    if (!widget.enabled || holding) return;
    setState(() => holding = true);
    progress.forward(from: 0);
    // The deadline owns confirmation. Reduced motion can change presentation,
    // but must never shorten the required continuous press.
    deadline = Timer(HoldButton.holdDuration, () {
      if (!mounted || !holding || !widget.enabled) return;
      setState(() => holding = false);
      progress.reset();
      unawaited(widget.onConfirmed());
    });
  }

  void cancel() {
    deadline?.cancel();
    deadline = null;
    holding = false;
    progress.reset();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    deadline?.cancel();
    progress.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) cancel();
  }

  Future<void> accessibleConfirm() async {
    if (!widget.enabled) return;
    cancel();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(widget.label),
        content: const Text('Confirmar o envio deste alerta para a central?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirmar envio'),
          ),
        ],
      ),
    );
    if (accepted == true && mounted && widget.enabled) {
      await widget.onConfirmed();
    }
  }

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return Focus(
      onFocusChange: (focused) {
        if (!focused) cancel();
      },
      onKeyEvent: (_, event) {
        if (event.logicalKey != LogicalKeyboardKey.space &&
            event.logicalKey != LogicalKeyboardKey.enter) {
          return KeyEventResult.ignored;
        }
        if (event is KeyDownEvent) begin();
        if (event is KeyUpEvent) cancel();
        return KeyEventResult.handled;
      },
      child: Semantics(
        onTap: widget.enabled ? accessibleConfirm : null,
        button: true,
        enabled: widget.enabled,
        label: widget.label,
        hint: 'Mantenha pressionado por cinco segundos. Solte para cancelar.',
        child: Listener(
          behavior: HitTestBehavior.opaque,
          onPointerDown: (event) {
            pointers.add(event.pointer);
            if (event.buttons != kPrimaryButton ||
                pointers.length != 1 ||
                pointer != null) {
              cancel();
              return;
            }
            pointer = event.pointer;
            origin = event.position;
            begin();
          },
          onPointerMove: (event) {
            if (event.pointer == pointer &&
                origin != null &&
                (event.position - origin!).distance > 8) {
              cancel();
            }
          },
          onPointerUp: (event) {
            pointers.remove(event.pointer);
            if (event.pointer == pointer) {
              pointer = null;
              origin = null;
              cancel();
            }
          },
          onPointerCancel: (event) {
            pointers.remove(event.pointer);
            if (event.pointer == pointer) {
              pointer = null;
              origin = null;
              cancel();
            }
          },
          child: ClipRRect(
            borderRadius: BorderRadius.circular(17),
            child: AnimatedBuilder(
              animation: progress,
              builder: (context, _) => Container(
                height: 68,
                color: widget.enabled ? widget.color : line,
                child: Stack(
                  children: [
                    if (!reducedMotion)
                      FractionallySizedBox(
                        widthFactor: progress.value,
                        child: Container(
                          color: Colors.white.withValues(alpha: .2),
                        ),
                      ),
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 15),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.shield_outlined,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 12),
                            Flexible(
                              child: Text(
                                holding
                                    ? 'Segure mais ${(5 * (1 - progress.value)).ceil().clamp(1, 5)} s…'
                                    : widget.label,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
