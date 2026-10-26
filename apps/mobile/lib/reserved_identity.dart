import 'package:flutter/material.dart';

/// The SOS identity is confined to the authenticated, private part of Lume.
abstract final class ReservedPalette {
  static const ink = Color(0xFF173452);
  static const navy = ink;
  static const muted = Color(0xFF62657A);
  static const line = Color(0xFFE6DDEB);
  static const teal = Color(0xFF218D82);
  static const tealInk = Color(0xFF176D64);
  static const plum = Color(0xFF683C70);
  static const paper = Color(0xFFF8F5F8);
  static const rose = Color(0xFFB73155);
  static const lavender = Color(0xFFF0E9F4);
  static const tealTint = Color(0xFFEAF5F2);
  static const roseTint = Color(0xFFFCECF0);
  static const amber = Color(0xFF916211);
  static const amberTint = Color(0xFFFBF3E3);
}

ThemeData reservedTheme(ThemeData base) {
  const shape = RoundedRectangleBorder(
    borderRadius: BorderRadius.all(Radius.circular(18)),
  );
  final scheme = ColorScheme.fromSeed(
    seedColor: ReservedPalette.plum,
    primary: ReservedPalette.plum,
    onPrimary: Colors.white,
    secondary: ReservedPalette.teal,
    onSecondary: Colors.white,
    surface: Colors.white,
    onSurface: ReservedPalette.ink,
    error: ReservedPalette.rose,
  );
  return base.copyWith(
    brightness: Brightness.light,
    colorScheme: scheme,
    scaffoldBackgroundColor: ReservedPalette.paper,
    textTheme: base.textTheme.apply(
      bodyColor: ReservedPalette.ink,
      displayColor: ReservedPalette.ink,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: ReservedPalette.paper,
      foregroundColor: ReservedPalette.ink,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: ReservedPalette.paper,
      contentPadding: const EdgeInsets.all(18),
      labelStyle: const TextStyle(color: ReservedPalette.muted),
      hintStyle: const TextStyle(color: ReservedPalette.muted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: ReservedPalette.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: ReservedPalette.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: ReservedPalette.plum, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        foregroundColor: Colors.white,
        backgroundColor: ReservedPalette.plum,
        minimumSize: const Size(0, 54),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        textStyle: const TextStyle(
          fontFamily: 'Montserrat',
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
        shape: shape,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: ReservedPalette.plum,
        minimumSize: const Size(0, 54),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        side: const BorderSide(color: ReservedPalette.line),
        textStyle: const TextStyle(
          fontFamily: 'Montserrat',
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
        shape: shape,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: ReservedPalette.plum),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return ReservedPalette.plum;
        return null;
      }),
      side: const BorderSide(color: ReservedPalette.muted, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
    ),
    dividerTheme: const DividerThemeData(color: ReservedPalette.line),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: ReservedPalette.teal,
      linearTrackColor: ReservedPalette.tealTint,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
      titleTextStyle: base.textTheme.titleLarge?.copyWith(
        color: ReservedPalette.ink,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
}

class ReservedSectionCard extends StatelessWidget {
  const ReservedSectionCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(22),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(26),
      border: Border.all(color: ReservedPalette.line),
      boxShadow: const [
        BoxShadow(
          color: Color(0x06683C70),
          blurRadius: 20,
          offset: Offset(0, 5),
        ),
      ],
    ),
    child: child,
  );
}

/// A single, gentle private entrance; emergency controls never wait for motion.
class ReservedEntrance extends StatelessWidget {
  const ReservedEntrance({super.key, required this.child, this.enabled = true});
  final Widget child;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    if (!enabled || MediaQuery.disableAnimationsOf(context)) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      child: child,
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(
          offset: Offset(0, 10 * (1 - value)),
          child: child,
        ),
      ),
    );
  }
}

class ReservedIdentityHeader extends StatelessWidget {
  const ReservedIdentityHeader({super.key, this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) => compact
      ? const Row(
          children: [
            ExcludeSemantics(
              child: Image(
                image: AssetImage('assets/reserved/sos-symbol-v3.png'),
                width: 38,
                height: 38,
                fit: BoxFit.contain,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'SOS Mulher',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        )
      : Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: ReservedPalette.line),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Colors.white, ReservedPalette.lavender],
            ),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final compact =
                  constraints.maxWidth < 440 ||
                  MediaQuery.textScalerOf(context).scale(16) > 24;
              const emblem = ExcludeSemantics(
                child: Image(
                  image: AssetImage('assets/reserved/sos-emblem-v3.png'),
                  width: 120,
                  height: 120,
                  fit: BoxFit.contain,
                  filterQuality: FilterQuality.high,
                ),
              );
              final message = Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Seu cuidado,\nno seu tempo.',
                    style: TextStyle(
                      color: ReservedPalette.ink,
                      fontSize: 31,
                      fontWeight: FontWeight.w600,
                      height: 1.18,
                      letterSpacing: -.9,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'SOS Mulher · rede de proteção',
                    style: TextStyle(
                      color: ReservedPalette.muted,
                      fontSize: 13,
                    ),
                  ),
                ],
              );
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const ExcludeSemantics(
                        child: Image(
                          image: AssetImage(
                            'assets/reserved/sos-symbol-v3.png',
                          ),
                          width: 38,
                          height: 38,
                          fit: BoxFit.contain,
                          filterQuality: FilterQuality.high,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'SOS Mulher',
                          style: TextStyle(
                            color: ReservedPalette.plum,
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  if (compact) ...[
                    const Center(child: emblem),
                    const SizedBox(height: 18),
                    message,
                  ] else
                    Row(
                      children: [
                        Expanded(child: message),
                        const SizedBox(width: 20),
                        emblem,
                      ],
                    ),
                ],
              );
            },
          ),
        );
}
