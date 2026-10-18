import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'main.dart';
import 'protection.dart';
import 'reserved.dart';

class BrowserHome extends StatefulWidget {
  const BrowserHome({super.key, required this.protection});
  final ProtectionController protection;
  @override
  State<BrowserHome> createState() => _BrowserHomeState();
}

class _BrowserHomeState extends State<BrowserHome> {
  final search = TextEditingController();
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> reserved() async {
    final allowed = await widget.protection.call('authenticateReserved');
    if (!mounted) return;
    if (allowed) {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => ReservedPage(protection: widget.protection),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.protection.error ?? 'Acesso reservado cancelado.',
          ),
        ),
      );
    }
  }

  void browse(String query) {
    final value = query.trim();
    if (value.isEmpty) return;
    final parsed = Uri.tryParse(
      value.contains('://') ? value : 'https://$value',
    );
    final looksLikeAddress =
        !value.contains(' ') &&
        value.contains('.') &&
        parsed != null &&
        parsed.host.isNotEmpty &&
        ['https', 'http'].contains(parsed.scheme);
    final uri = looksLikeAddress
        ? parsed
        : Uri.https('duckduckgo.com', '/', {'q': value});
    Navigator.push(
      context,
      MaterialPageRoute<void>(builder: (_) => BrowserPage(uri: uri)),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset(
            'assets/brand/icon-v2.png',
            width: 42,
            height: 42,
            excludeFromSemantics: true,
          ),
          const SizedBox(width: 8),
          const Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: 'Lume ',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 23),
                ),
                TextSpan(
                  text: 'Navegador',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
      actions: [
        PopupMenuButton<String>(
          tooltip: 'Configurações',
          icon: const Icon(Icons.more_horiz),
          onSelected: (_) => reserved(),
          itemBuilder: (_) => [
            const PopupMenuItem(
              value: 'reserved',
              child: Text('Área reservada'),
            ),
          ],
        ),
      ],
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
          children: [
            const Text(
              'O que vamos\nexplorar?',
              style: TextStyle(
                color: ink,
                fontSize: 37,
                height: 1.15,
                fontWeight: FontWeight.w600,
                letterSpacing: -1.5,
              ),
            ),
            const SizedBox(height: 30),
            TextField(
              controller: search,
              textInputAction: TextInputAction.search,
              onSubmitted: browse,
              decoration: InputDecoration(
                hintText: 'Buscar ou digitar endereço',
                prefixIcon: const Icon(Icons.search, color: ink),
                suffixIcon: IconButton(
                  tooltip: 'Buscar',
                  onPressed: () => browse(search.text),
                  icon: const Icon(Icons.arrow_forward),
                ),
              ),
            ),
            const SizedBox(height: 36),
            const Text(
              'Favoritos',
              style: TextStyle(fontSize: 21, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 18),
            LayoutBuilder(
              builder: (context, constraints) => Wrap(
                spacing: 14,
                runSpacing: 14,
                children: [
                  favorite(
                    constraints.maxWidth,
                    Icons.article_outlined,
                    'Notícias',
                    'https://agenciabrasil.ebc.com.br',
                  ),
                  favorite(
                    constraints.maxWidth,
                    Icons.wb_sunny_outlined,
                    'Tempo',
                    'https://portal.inmet.gov.br',
                  ),
                  favorite(
                    constraints.maxWidth,
                    Icons.map_outlined,
                    'Mapas',
                    'https://www.openstreetmap.org',
                  ),
                  favorite(
                    constraints.maxWidth,
                    Icons.menu_book_outlined,
                    'Leituras',
                    'https://www.gov.br/cultura',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),
            Container(
              padding: const EdgeInsets.all(26),
              decoration: BoxDecoration(
                color: const Color(0xFFE6F1F5),
                borderRadius: BorderRadius.circular(28),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.explore_outlined, size: 36, color: ink),
                  SizedBox(height: 17),
                  Text(
                    'Seu próximo caminho.',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 23),
                  ),
                  SizedBox(height: 12),
                  Text(
                    'Um lugar simples para suas buscas, páginas e descobertas.',
                    style: TextStyle(color: muted, fontSize: 16, height: 1.7),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            const Row(
              children: [
                Icon(Icons.lock_outline, size: 18, color: muted),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Você escolhe aonde ir.',
                    style: TextStyle(color: muted, fontSize: 13),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
    bottomNavigationBar: SafeArea(
      child: Container(
        height: 68,
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: line)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            const Icon(Icons.explore_outlined, color: ink),
            IconButton(
              tooltip: 'Buscar na web',
              icon: const Icon(Icons.search),
              onPressed: () =>
                  browse(search.text.isEmpty ? 'Ariquemes' : search.text),
            ),
            IconButton(
              tooltip: 'Área reservada',
              icon: const Icon(Icons.tune),
              onPressed: reserved,
            ),
          ],
        ),
      ),
    ),
  );
  Widget favorite(double width, IconData icon, String label, String url) =>
      SizedBox(
        width: (width - 14) / 2,
        child: Material(
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: const BorderSide(color: line),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: () => browse(url),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color(0xFFEAF2F5),
                    ),
                    child: Icon(icon, color: ink),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class BrowserPage extends StatefulWidget {
  const BrowserPage({super.key, required this.uri});
  final Uri uri;
  @override
  State<BrowserPage> createState() => _BrowserPageState();
}

class _BrowserPageState extends State<BrowserPage> {
  late final WebViewController web;
  int progress = 0;
  String? error;
  @override
  void initState() {
    super.initState();
    web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) {
            if (mounted) setState(() => progress = p);
          },
          onPageStarted: (_) {
            if (mounted) setState(() => error = null);
          },
          onWebResourceError: (e) {
            if (mounted && e.isForMainFrame == true) {
              setState(
                () => error =
                    'Não foi possível abrir esta página. Confira sua conexão.',
              );
            }
          },
          onNavigationRequest: (request) =>
              ['http', 'https'].contains(Uri.tryParse(request.url)?.scheme)
              ? NavigationDecision.navigate
              : NavigationDecision.prevent,
        ),
      )
      ..loadRequest(widget.uri);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.uri.host, style: const TextStyle(fontSize: 14)),
      actions: [
        IconButton(
          tooltip: 'Recarregar',
          onPressed: () => web.reload(),
          icon: const Icon(Icons.refresh),
        ),
      ],
      bottom: progress < 100
          ? PreferredSize(
              preferredSize: const Size.fromHeight(3),
              child: LinearProgressIndicator(
                value: progress / 100,
                minHeight: 3,
              ),
            )
          : null,
    ),
    body: error != null
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(error!),
            ),
          )
        : WebViewWidget(controller: web),
    bottomNavigationBar: SafeArea(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          IconButton(
            tooltip: 'Página anterior',
            onPressed: () async {
              if (await web.canGoBack()) {
                await web.goBack();
              }
            },
            icon: const Icon(Icons.chevron_left),
          ),
          IconButton(
            tooltip: 'Página seguinte',
            onPressed: () async {
              if (await web.canGoForward()) {
                await web.goForward();
              }
            },
            icon: const Icon(Icons.chevron_right),
          ),
          IconButton(
            tooltip: 'Página inicial',
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.home_outlined),
          ),
        ],
      ),
    ),
  );
}
