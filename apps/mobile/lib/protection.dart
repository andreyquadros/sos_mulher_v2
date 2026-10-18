import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class ProtectionStatus {
  const ProtectionStatus({
    this.paired = false,
    this.armed = false,
    this.permissionsGranted = false,
    this.consentAudio = false,
    this.sharingPaused = false,
    this.simulated = false,
    this.escalationPending = false,
    this.physicalConnected = false,
    this.physicalConflict = false,
    this.physicalEnabled = false,
    this.physicalReady = false,
    this.physicalTrainedLocked = false,
    this.physicalTraining = 'idle',
    this.physicalCooldownSeconds = 0,
    this.voiceAvailable = false,
    this.voiceEnabled = false,
    this.voiceListening = false,
    this.voiceReady = false,
    this.voiceTrainedLocked = false,
    this.voiceTraining = 'idle',
    this.voicePhraseId = 'estrela_azul',
    this.voiceError,
    this.voiceCooldownSeconds = 0,
    this.voiceConfirmationPending = false,
    this.womanName = '',
    this.incidentId,
    this.receivedAt,
    this.assignedName,
    this.acknowledgedAt,
    this.pendingCount = 0,
    this.failedCount = 0,
    this.lastError,
  });
  factory ProtectionStatus.fromMap(Map<Object?, Object?> data) =>
      ProtectionStatus(
        paired: data['paired'] == true,
        armed: data['armed'] == true,
        permissionsGranted: data['permissionsGranted'] == true,
        consentAudio: data['consentAudio'] == true,
        sharingPaused: data['sharingPaused'] == true,
        simulated: data['simulated'] == true,
        escalationPending: data['escalationPending'] == true,
        physicalConnected: data['physicalConnected'] == true,
        physicalConflict: data['physicalConflict'] == true,
        physicalEnabled: data['physicalEnabled'] == true,
        physicalReady: data['physicalReady'] == true,
        physicalTrainedLocked: data['physicalTrainedLocked'] == true,
        physicalTraining: data['physicalTraining'] as String? ?? 'idle',
        physicalCooldownSeconds:
            ((data['physicalCooldownSeconds'] as num?)?.toInt() ?? 0).clamp(
              0,
              30,
            ),
        voiceAvailable: data['voiceAvailable'] == true,
        voiceEnabled: data['voiceEnabled'] == true,
        voiceListening: data['voiceListening'] == true,
        voiceReady: data['voiceReady'] == true,
        voiceTrainedLocked: data['voiceTrainedLocked'] == true,
        voiceTraining: data['voiceTraining'] as String? ?? 'idle',
        voicePhraseId: data['voicePhraseId'] as String? ?? 'estrela_azul',
        voiceError: data['voiceError'] as String?,
        voiceCooldownSeconds:
            ((data['voiceCooldownSeconds'] as num?)?.toInt() ?? 0).clamp(0, 30),
        voiceConfirmationPending: data['voiceConfirmationPending'] == true,
        womanName: data['womanName'] as String? ?? '',
        incidentId: data['incidentId'] as String?,
        receivedAt: data['receivedAt'] as String?,
        assignedName: data['assignedName'] as String?,
        acknowledgedAt: data['acknowledgedAt'] as String?,
        pendingCount: (data['pendingCount'] as num?)?.toInt() ?? 0,
        failedCount: (data['failedCount'] as num?)?.toInt() ?? 0,
        lastError: data['lastError'] as String?,
      );
  final bool paired,
      armed,
      permissionsGranted,
      consentAudio,
      sharingPaused,
      simulated,
      escalationPending,
      physicalConnected,
      physicalConflict,
      physicalEnabled,
      physicalReady,
      physicalTrainedLocked,
      voiceAvailable,
      voiceEnabled,
      voiceListening,
      voiceReady,
      voiceTrainedLocked,
      voiceConfirmationPending;
  final String womanName;
  final String? incidentId, receivedAt, assignedName, acknowledgedAt, lastError;
  final int pendingCount,
      failedCount,
      physicalCooldownSeconds,
      voiceCooldownSeconds;
  final String physicalTraining, voiceTraining, voicePhraseId;
  final String? voiceError;
  bool get physicalTrainingActive =>
      physicalTraining == 'waiting' || physicalTraining == 'unlocked';
  bool get physicalActivationAllowed =>
      paired &&
      armed &&
      physicalConnected &&
      !physicalConflict &&
      physicalTrainedLocked &&
      !physicalTrainingActive &&
      !physicalEnabled;
  bool get physicalTriggerReady =>
      physicalReady &&
      paired &&
      armed &&
      physicalConnected &&
      !physicalConflict &&
      physicalEnabled &&
      physicalTrainedLocked &&
      !physicalTrainingActive;
  bool get voiceTrainingActive =>
      ['loading', 'waiting', 'unlocked'].contains(voiceTraining);
  bool get voiceSessionAllowed =>
      voiceAvailable &&
      paired &&
      armed &&
      permissionsGranted &&
      consentAudio &&
      !sharingPaused &&
      !hasIncident &&
      !physicalTrainingActive;
  bool get voiceTrainingAllowed => voiceSessionAllowed && !voiceTrainingActive;
  bool get voiceActivationAllowed =>
      voiceTrainingAllowed && voiceTrainedLocked && !voiceEnabled;
  bool get voiceTriggerReady =>
      voiceSessionAllowed &&
      voiceReady &&
      voiceEnabled &&
      voiceListening &&
      voiceTrainedLocked &&
      !voiceTrainingActive &&
      (voiceError == null || voiceError!.isEmpty);
  bool get hasIncident => incidentId != null;
  String get alertLabel => escalationPending
      ? 'Alerta real aguardando envio'
      : assignedName != null
      ? 'Acompanhada pela central'
      : acknowledgedAt != null
      ? 'Reconhecida pela central'
      : receivedAt != null
      ? 'Recebida pela central'
      : 'Aguardando envio';
}

class ProtectionController extends ChangeNotifier {
  ProtectionController({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel('br.gov.ro.lume/protection');
  final MethodChannel _channel;
  ProtectionStatus status = const ProtectionStatus();
  String? error;
  bool busy = false;
  Timer? _poll;
  bool _disposed = false;
  bool _refreshing = false;

  void start() {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'statusChanged' && call.arguments is Map) {
        status = ProtectionStatus.fromMap(
          Map<Object?, Object?>.from(call.arguments),
        );
        if (!_disposed) notifyListeners();
      }
    });
    unawaited(refresh());
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => refresh());
  }

  Future<void> refresh() async {
    if (_disposed || _refreshing || busy) return;
    _refreshing = true;
    try {
      final result = await _channel.invokeMapMethod<Object?, Object?>('status');
      if (result != null) status = ProtectionStatus.fromMap(result);
    } on PlatformException {
      status = const ProtectionStatus();
      error =
          'Não foi possível consultar o serviço. Abra a área reservada para revisar.';
    } on MissingPluginException {
      error =
          'A proteção em segundo plano está disponível no aplicativo Android.';
    } finally {
      _refreshing = false;
      if (!_disposed) notifyListeners();
    }
  }

  Future<bool> call(String method, [Map<String, Object?>? args]) async {
    if (busy || _disposed) return false;
    busy = true;
    error = null;
    notifyListeners();
    try {
      final result = await _channel.invokeMapMethod<Object?, Object?>(
        method,
        args,
      );
      if (result != null) status = ProtectionStatus.fromMap(result);
      return true;
    } on PlatformException catch (e) {
      error =
          e.message ??
          'Não foi possível concluir. Revise o vínculo e as permissões.';
      return false;
    } on MissingPluginException {
      error = 'Esta função exige o aplicativo Android instalado.';
      return false;
    } finally {
      busy = false;
      if (!_disposed) notifyListeners();
    }
  }

  Future<void> leaveReserved() async {
    try {
      await _channel.invokeMethod<Object?>('leaveReserved');
    } on PlatformException {
      // The private route is already closed; no sensitive state is exposed.
    } on MissingPluginException {
      // Widget tests and unsupported platforms have no native privacy window.
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    _channel.setMethodCallHandler(null);
    super.dispose();
  }
}
