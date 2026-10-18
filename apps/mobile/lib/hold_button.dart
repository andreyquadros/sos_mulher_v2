import 'dart:async';
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
    duration: const Duration(seconds: 3),
  );
  bool holding = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    progress.addStatusListener((status) {
      if (status == AnimationStatus.completed && holding && widget.enabled) {
        holding = false;
        unawaited(widget.onConfirmed());
        progress.reset();
      }
    });
  }

  @override
  void didUpdateWidget(HoldButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.enabled) cancel();
  }

  void begin() {
    if (widget.enabled && !holding) {
      holding = true;
      progress.forward(from: 0);
    }
  }

  void cancel() {
    holding = false;
    progress.reset();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    progress.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) cancel();
  }

  Future<void> accessibleConfirm() async {
    if (!widget.enabled) return;
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
        hint: 'Mantenha pressionado por três segundos. Solte para cancelar.',
        child: GestureDetector(
          onTapDown: (_) => begin(),
          onTapUp: (_) => cancel(),
          onTapCancel: cancel,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(17),
            child: AnimatedBuilder(
              animation: progress,
              builder: (context, _) => Container(
                height: 68,
                color: widget.enabled ? widget.color : line,
                child: Stack(
                  children: [
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
                                    ? 'Mantenha pressionado…'
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
