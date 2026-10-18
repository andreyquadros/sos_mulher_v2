import 'package:flutter/material.dart';
import 'browser.dart';
import 'protection.dart';

void main() => runApp(const LumeApp());
const ink = Color(0xFF173452);
const muted = Color(0xFF677F96);
const paper = Color(0xFFF5F8FB);
const line = Color(0xFFDCE5EF);
const teal = Color(0xFF218D82);
const rose = Color(0xFFD94768);

class LumeApp extends StatefulWidget {
  const LumeApp({super.key, this.protection});
  final ProtectionController? protection;
  @override
  State<LumeApp> createState() => _LumeAppState();
}

class _LumeAppState extends State<LumeApp> {
  late final ProtectionController protection =
      widget.protection ?? ProtectionController();
  @override
  void initState() {
    super.initState();
    protection.start();
  }

  @override
  void dispose() {
    protection.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Lume Navegador',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      fontFamily: 'Montserrat',
      scaffoldBackgroundColor: paper,
      colorScheme: ColorScheme.fromSeed(
        seedColor: ink,
        primary: ink,
        surface: Colors.white,
      ),
      textTheme: const TextTheme(
        bodyMedium: TextStyle(color: ink, height: 1.5),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: paper,
        foregroundColor: ink,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.all(20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: const BorderSide(color: line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: const BorderSide(color: line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(double.infinity, 54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(double.infinity, 54),
          side: const BorderSide(color: line),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    ),
    home: BrowserHome(protection: protection),
  );
}
