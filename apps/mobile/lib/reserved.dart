import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'main.dart';
import 'protection.dart';
import 'hold_button.dart';
import 'physical_trigger_card.dart';

class ReservedPage extends StatefulWidget {
  const ReservedPage({super.key, required this.protection});
  final ProtectionController protection;
  @override
  State<ReservedPage> createState() => _ReservedPageState();
}

class _ReservedPageState extends State<ReservedPage>
    with WidgetsBindingObserver {
  final code = TextEditingController();
  final baseUrl = TextEditingController(
    text: const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: kDebugMode ? 'http://10.0.2.2:3001' : '',
    ),
  );
  bool locationConsent = false, audioConsent = false;
  bool closing = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && mounted && !closing) {
      final navigator = Navigator.of(context);
      final reservedRoute = ModalRoute.of(context);
      if (reservedRoute == null || !reservedRoute.isActive) return;
      closing = true;
      // Close private dialogs as well as the route when Android settings or the
      // lock screen take over. Returning always requires authentication again.
      navigator.popUntil((route) => route == reservedRoute);
      if (navigator.canPop()) navigator.pop();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.protection.leaveReserved();
    code.dispose();
    baseUrl.dispose();
    super.dispose();
  }

  Future<void> configure() async {
    final uri = Uri.tryParse(baseUrl.text.trim());
    if (uri == null ||
        !uri.hasAuthority ||
        uri.userInfo.isNotEmpty ||
        (!kDebugMode && uri.scheme != 'https') ||
        !['http', 'https'].contains(uri.scheme) ||
        code.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Informe o endereço HTTPS da central e o código recebido.',
          ),
        ),
      );
      return;
    }
    await widget.protection.call('configure', {
      'baseUrl': baseUrl.text.trim().replaceFirst(RegExp(r'/+$'), ''),
      'code': code.text.trim(),
      'consentLocation': locationConsent,
      'consentAudio': audioConsent,
    });
    code.clear();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.protection,
    builder: (context, _) {
      final c = widget.protection;
      final s = c.status;
      return Scaffold(
        appBar: AppBar(
          title: const Text(
            'Área reservada',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          actions: [
            IconButton(
              tooltip: 'Atualizar estado',
              onPressed: c.refresh,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
              children: [
                const Text(
                  'Seu cuidado,\nno seu tempo.',
                  style: TextStyle(
                    fontSize: 33,
                    fontWeight: FontWeight.w600,
                    height: 1.15,
                    letterSpacing: -1,
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'SOS Mulher · rede de proteção',
                  style: TextStyle(color: muted, fontSize: 14),
                ),
                const SizedBox(height: 28),
                if (!s.paired) ...pairing(c) else ...prepared(c, s),
                if (c.error != null || s.lastError != null) ...[
                  const SizedBox(height: 20),
                  Semantics(
                    liveRegion: true,
                    child: info(
                      'Atenção',
                      c.error ?? s.lastError!,
                      warning: true,
                    ),
                  ),
                ],
                if (c.busy)
                  const Padding(
                    padding: EdgeInsets.all(18),
                    child: LinearProgressIndicator(),
                  ),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.explore_outlined),
                  label: const Text('Voltar ao Lume'),
                ),
                const SizedBox(height: 18),
                const Text(
                  'O envio depende de rede e de uma central em operação. Em perigo imediato, use também os canais de emergência disponíveis.',
                  style: TextStyle(color: muted, fontSize: 11),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
  List<Widget> pairing(ProtectionController c) => [
    const Text(
      'Vincule este aparelho',
      style: TextStyle(fontSize: 21, fontWeight: FontWeight.w600),
    ),
    const SizedBox(height: 12),
    const Text(
      'A equipe de atendimento cadastra você e entrega um código de uso único. O vínculo é uma escolha sua.',
      style: TextStyle(color: muted),
    ),
    const SizedBox(height: 20),
    TextField(
      controller: baseUrl,
      keyboardType: TextInputType.url,
      autocorrect: false,
      decoration: const InputDecoration(
        labelText: 'Endereço da central',
        hintText: 'https://central.exemplo.gov.br',
      ),
    ),
    const SizedBox(height: 14),
    TextField(
      controller: code,
      autocorrect: false,
      enableSuggestions: false,
      decoration: const InputDecoration(labelText: 'Código de vínculo'),
      textCapitalization: TextCapitalization.characters,
    ),
    const SizedBox(height: 20),
    info(
      'Você mantém o controle',
      'Localização e áudio só são enviados durante uma ocorrência acionada neste aparelho. O Android mantém uma notificação do serviço e seus indicadores de uso. A central não pode ligar o microfone à distância.',
    ),
    CheckboxListTile(
      contentPadding: EdgeInsets.zero,
      value: locationConsent,
      onChanged: (v) => setState(() => locationConsent = v!),
      title: const Text(
        'Autorizo compartilhar minha localização durante um alerta.',
      ),
      subtitle: const Text('Necessário para orientar o atendimento.'),
    ),
    CheckboxListTile(
      contentPadding: EdgeInsets.zero,
      value: audioConsent,
      onChanged: (v) => setState(() => audioConsent = v!),
      title: const Text('Autorizo transmitir áudio durante um alerta.'),
      subtitle: const Text(
        'Opcional. A equipe autorizada pode ouvir e o acesso é registrado.',
      ),
    ),
    const SizedBox(height: 14),
    FilledButton(
      onPressed: !locationConsent || c.busy ? null : configure,
      child: Text(
        c.busy ? 'Verificando vínculo…' : 'Vincular com meu consentimento',
      ),
    ),
  ];
  List<Widget> prepared(ProtectionController c, ProtectionStatus s) => [
    Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.verified_user_outlined, color: teal, size: 30),
              const SizedBox(width: 13),
              Expanded(
                child: Text(
                  s.womanName.isEmpty ? 'Vínculo verificado' : s.womanName,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            s.armed
                ? 'Serviço ativo neste aparelho'
                : 'Proteção precisa ser ativada',
            style: TextStyle(
              color: s.armed ? teal : const Color(0xFF9B6608),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'O estado do serviço não garante conexão nem atendimento. Faça o teste com a equipe.',
            style: TextStyle(fontSize: 12, color: muted),
          ),
        ],
      ),
    ),
    const SizedBox(height: 20),
    statusRow(
      Icons.phone_android,
      'Serviço do aparelho',
      s.armed
          ? 'Ativo · notificação do Android presente'
          : 'Inativo · abra e ative novamente',
      s.armed,
    ),
    statusRow(
      Icons.location_on_outlined,
      'Permissões do aparelho',
      s.permissionsGranted
          ? 'Permissões concedidas'
          : 'Revisar localização, áudio e notificações',
      s.permissionsGranted,
    ),
    statusRow(
      Icons.mic_none_outlined,
      'Áudio durante ocorrência',
      s.consentAudio
          ? 'Autorizado por você'
          : 'Não autorizado · alerta com localização',
      true,
    ),
    statusRow(
      Icons.sync,
      'Fila de envio',
      s.pendingCount == 0
          ? 'Sem itens pendentes'
          : '${s.pendingCount} item(ns) aguardando confirmação',
      s.pendingCount == 0,
    ),
    const SizedBox(height: 22),
    OutlinedButton.icon(
      onPressed: c.busy ? null : () => c.call('requestPermissions'),
      icon: const Icon(Icons.settings_outlined),
      label: const Text('Revisar permissões'),
    ),
    const SizedBox(height: 12),
    if (!s.armed || s.sharingPaused)
      FilledButton.icon(
        onPressed: c.busy ? null : () => c.call('arm'),
        icon: const Icon(Icons.shield_outlined),
        label: Text(
          s.sharingPaused
              ? 'Retomar compartilhamento'
              : 'Ativar proteção neste aparelho',
        ),
      ),
    if (s.failedCount > 0) ...[
      const SizedBox(height: 18),
      info(
        'Envios não confirmados',
        '${s.failedCount} item(ns) não puderam ser entregues e foram separados da fila. Procure a equipe para revisar o vínculo e o horário do aparelho.',
        warning: true,
      ),
    ],
    const SizedBox(height: 18),
    if (s.hasIncident) ...[
      if (s.simulated && !s.escalationPending)
        info(
          'TESTE SIMULADO EM ANDAMENTO',
          'Se precisar de ajuda agora, use o botão de alerta real abaixo. Um teste aberto não impede uma emergência.',
        ),
      if (s.sharingPaused)
        info(
          'Compartilhamento interrompido',
          'Você interrompeu novas capturas neste aparelho. O alerta continua aberto na central.',
        ),
      info(
        s.alertLabel,
        s.escalationPending
            ? 'O pedido real está salvo neste aparelho e aguarda confirmação do servidor. O recebimento anterior do teste não confirma o recebimento desta emergência.'
            : s.assignedName != null
            ? 'Responsável: ${s.assignedName}. Acompanhe as orientações da sua equipe.'
            : s.acknowledgedAt != null
            ? 'Um operador reconheceu o alerta. A atribuição de responsável ainda está pendente.'
            : s.receivedAt != null
            ? 'O servidor confirmou o recebimento. A confirmação de atendimento humano ainda está pendente.'
            : 'O alerta está salvo neste aparelho. Sem confirmação do servidor, o atendimento ainda não está confirmado.',
      ),
      const SizedBox(height: 18),
      const Text(
        'A coleta termina quando a ocorrência é encerrada pela equipe e o aparelho recebe essa atualização.',
        style: TextStyle(color: muted, fontSize: 12),
      ),
      if (!s.sharingPaused) ...[
        const SizedBox(height: 16),
        OutlinedButton.icon(
          icon: const Icon(Icons.pause_circle_outline),
          label: const Text('Interromper compartilhamento'),
          onPressed: c.busy
              ? null
              : () async {
                  final stop = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Interromper novas capturas?'),
                      content: const Text(
                        'O aparelho vai parar de coletar localização e áudio. O alerta continua aberto na central e os dados já capturados continuam na fila de envio.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Continuar'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Interromper'),
                        ),
                      ],
                    ),
                  );
                  if (stop == true) {
                    await c.call('stopSharing');
                  }
                },
        ),
      ],
      if (s.simulated) ...[
        const SizedBox(height: 24),
        HoldButton(
          label: 'Segure 3 s para alerta real',
          color: rose,
          enabled: !c.busy,
          onConfirmed: () =>
              c.call('trigger', {'simulated': false, 'trigger': 'hold'}),
        ),
      ],
    ] else ...[
      if (s.armed)
        FilledButton.icon(
          onPressed: c.busy ? null : () => c.call('disarm'),
          icon: const Icon(Icons.pause_circle_outline),
          label: const Text('Pausar serviço'),
        ),
      const SizedBox(height: 28),
      const Text(
        'TREINE COM A EQUIPE',
        style: TextStyle(
          color: muted,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.4,
        ),
      ),
      const SizedBox(height: 12),
      HoldButton(
        label: 'Segure 3 s para teste simulado',
        color: const Color(0xFF735387),
        enabled: !c.busy,
        onConfirmed: () =>
            c.call('trigger', {'simulated': true, 'trigger': 'hold'}),
      ),
      const SizedBox(height: 10),
      const Text(
        'O teste envia localização e, se autorizado, áudio. A central verá a identificação de SIMULADO.',
        style: TextStyle(color: muted, fontSize: 12),
      ),
      const SizedBox(height: 26),
      const Text(
        'PRECISO DE AJUDA AGORA',
        style: TextStyle(
          color: rose,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.4,
        ),
      ),
      const SizedBox(height: 12),
      HoldButton(
        label: 'Segure 3 s para alerta real',
        color: rose,
        enabled: !c.busy,
        onConfirmed: () =>
            c.call('trigger', {'simulated': false, 'trigger': 'hold'}),
      ),
    ],
    const SizedBox(height: 26),
    info(
      'Atalhos e funcionamento',
      'Você pode manter o botão do aplicativo pressionado por 3 segundos ou abrir a confirmação de 3 segundos pela notificação do serviço. O acionamento físico por volume é opcional e precisa de configuração e treino abaixo. Palavra-chave contínua não está habilitada.',
    ),
    const SizedBox(height: 20),
    PhysicalTriggerCard(protection: c),
    const SizedBox(height: 16),
    const Text(
      'Se o Android encerrar o aplicativo, reinicie o serviço ao abrir novamente. Tela bloqueada, economia de bateria e conectividade precisam ser testadas neste modelo de celular.',
      style: TextStyle(color: muted, fontSize: 12),
    ),
  ];
  Widget statusRow(IconData icon, String title, String subtitle, bool good) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 13),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: good ? teal : const Color(0xFFB67C21), size: 25),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: const TextStyle(color: muted, fontSize: 12),
                  ),
                  const SizedBox(height: 13),
                  const Divider(color: line, height: 1),
                ],
              ),
            ),
          ],
        ),
      );
}

Widget info(String title, String content, {bool warning = false}) => Container(
  padding: const EdgeInsets.all(20),
  decoration: BoxDecoration(
    color: warning ? const Color(0xFFFFE9EC) : const Color(0xFFE8F1F4),
    borderRadius: BorderRadius.circular(20),
  ),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: warning ? rose : ink,
        ),
      ),
      const SizedBox(height: 9),
      Text(
        content,
        style: const TextStyle(color: muted, fontSize: 12, height: 1.65),
      ),
    ],
  ),
);
