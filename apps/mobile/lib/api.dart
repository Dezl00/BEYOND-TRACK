import 'dart:async';
import 'package:flutter/foundation.dart';
import 'page_cache.dart';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiFailure implements Exception {
  final int status;
  final String message;
  ApiFailure(this.status, this.message);
  @override
  String toString() => message;
}

class TrackApi {
  static final origin = Uri.parse(
    const String.fromEnvironment(
      'TRACK_API_ORIGIN',
      defaultValue: 'https://www.beyond-track.online',
    ),
  );
  final storage = const FlutterSecureStorage();
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 12);
  String? session;
  String locale = 'ar';

  final project = ValueNotifier((id: '', name: ''));
  final cache = PageCache();
  final _memory =
      <
        String,
        ({Map<String, dynamic> body, DateTime expiry, DateTime fetched})
      >{};
  final _pending = <String, Future<Map<String, dynamic>>>{};
  int _generation = 0;
  final changes = ValueNotifier(0);
  String _pathKey(String path) =>
      path == '/api/v1/pages/me' ? path : '$locale:$path';

  Future<Map<String, dynamic>> page(
    String path, {
    bool force = false,
    void Function(Map<String, dynamic>)? preview,
  }) async {
    final current = session, generation = _generation, diskKey = _pathKey(path);
    final key = '$current:$diskKey';
    final entry = _memory[key];
    final now = DateTime.now();
    Map<String, dynamic>? saved;
    if (entry != null && entry.expiry.isAfter(now)) {
      if (!force &&
          now.difference(entry.fetched) < const Duration(seconds: 45)) {
        return entry.body;
      }
      saved = entry.body;
    } else if (current != null) {
      saved = await cache.read(current, diskKey);
    }
    if (session != current || generation != _generation)
      throw StateError('Session changed');
    if (saved != null) preview?.call(saved);
    final running = _pending[key];
    if (running != null) return running;
    final request = _fetchPage(path, diskKey, key, current, generation, saved);
    _pending[key] = request;
    try {
      return await request;
    } finally {
      if (identical(_pending[key], request)) _pending.remove(key);
    }
  }

  Future<Map<String, dynamic>> _fetchPage(
    String path,
    String diskKey,
    String key,
    String? current,
    int generation,
    Map<String, dynamic>? saved,
  ) async {
    try {
      final value = await call(path);
      if (generation != _generation || current != session)
        throw StateError('Session changed');
      if (path == '/api/v1/pages/me' &&
          saved != null &&
          [
            'permissions',
            'navigation',
            'role_id',
            'canManageUnits',
            'projectScope',
            'workflow_role',
            'force_password_change',
          ].any(
            (field) => jsonEncode(saved[field]) != jsonEncode(value[field]),
          )) {
        await _invalidate();
        generation = _generation;
        project.value = (id: '', name: '');
      }
      if (current != null) {
        final expiry = DateTime.tryParse(
          await storage.read(key: 'sessionExpiry') ?? '',
        );
        if (expiry != null &&
            expiry.isAfter(DateTime.now()) &&
            current == session &&
            generation == _generation) {
          _memory[key] = (body: value, expiry: expiry, fetched: DateTime.now());
          await cache.save(current, diskKey, value, expiry);
        }
      }
      return value;
    } on SocketException {
      if (current != session || generation != _generation || saved == null)
        rethrow;
      return saved;
    } on TimeoutException {
      if (current != session || generation != _generation || saved == null)
        rethrow;
      return saved;
    }
  }

  /// Finish a cold read on the source screen before starting the transition.
  Future<void> prepare(String path) async {
    final current = session, diskKey = _pathKey(path);
    if (snapshot(path) != null) return;
    if (current != null) {
      final generation = _generation;
      final cached = await cache.readEntry(current, diskKey);
      if (cached != null && current == session && generation == _generation) {
        _memory['$current:$diskKey'] = (
          body: cached.body,
          expiry: cached.expiry,
          fetched: DateTime.fromMillisecondsSinceEpoch(0),
        );
        return;
      }
    }
    await page(path);
  }

  Map<String, dynamic>? snapshot(String path) {
    final entry = _memory['$session:${_pathKey(path)}'];
    return entry != null && entry.expiry.isAfter(DateTime.now())
        ? entry.body
        : null;
  }

  Future<void> _invalidate() async {
    _generation++;
    _pending.clear();
    _memory.clear();
    if (session != null) await cache.erase(session!);
  }

  Future<Map<String, dynamic>> call(
    String path, [
    Map<String, dynamic>? data,
  ]) async {
    final current = session;
    final value = await _network(path, data);
    if (current != null &&
        session == current &&
        data != null &&
        (path == '/api/commands' || path == '/api/import')) {
      await _invalidate();
      changes.value++;
    }
    return value;
  }

  Future<Map<String, dynamic>> _network(
    String path, [
    Map<String, dynamic>? data,
  ]) async {
    if (origin.scheme != 'https') throw StateError('HTTPS required');
    final uri = origin.resolve(path);
    if (uri.origin != origin.origin) throw StateError('Unexpected server');
    final sendingSession = session;
    final request = await client.openUrl(data == null ? 'GET' : 'POST', uri);
    request.followRedirects = false;
    request.headers.set('Origin', origin.origin);
    request.cookies.add(Cookie('bt-locale', locale));
    if (sendingSession != null)
      request.cookies.add(Cookie('__Host-bt', sendingSession));
    if (data != null) {
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(data));
    }
    final response = await request.close().timeout(const Duration(seconds: 25));
    final body = await utf8.decoder
        .bind(response)
        .join()
        .timeout(const Duration(seconds: 25));
    final value = jsonDecode(body) as Map<String, dynamic>;
    if ((response.statusCode == 401 || response.statusCode == 403) &&
        sendingSession != null &&
        session == sendingSession)
      await _invalidate();
    if (response.statusCode >= 300)
      throw ApiFailure(
        response.statusCode,
        value['error']?.toString() ?? 'HTTP ${response.statusCode}',
      );
    for (final cookie in response.cookies.where((c) => c.name == '__Host-bt')) {
      session = cookie.value;
      await storage.write(key: 'session', value: session);
      await storage.write(
        key: 'sessionExpiry',
        value: (cookie.expires ?? DateTime.now().add(const Duration(hours: 1)))
            .toUtc()
            .toIso8601String(),
      );
    }
    return value;
  }

  bool pickingFile = false;
  static String operationId() {
    final random = Random.secure(),
        bytes = List.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  Future<void> openAttachment(String id) async {
    final req = await client.getUrl(origin.resolve('/api/attachments/$id'));
    req.followRedirects = false;
    req.cookies.add(Cookie('__Host-bt', session!));
    final res = await req.close(), url = res.headers.value('location');
    await res.drain<void>();
    if (res.statusCode != 302 || url == null)
      throw ApiFailure(res.statusCode, 'HTTP ${res.statusCode}');
    await const MethodChannel(
      'online.beyondtrack.app/device',
    ).invokeMethod('openAttachment', {'url': url});
  }

  Future<List<Map<String, String>>> pickAttachments(
    String id,
    String purpose,
    String key,
  ) async {
    final current = session;
    pickingFile = true;
    late final List<XFile> files;
    try {
      files = await openFiles(
        acceptedTypeGroups: [
          const XTypeGroup(
            label: 'PDF / Images',
            mimeTypes: [
              'application/pdf',
              'image/png',
              'image/jpeg',
              'image/webp',
            ],
          ),
        ],
      );
    } finally {
      pickingFile = false;
    }
    final results = <Map<String, String>>[];
    for (final file in files) {
      if (session != current || current == null)
        throw StateError('Session expired');
      final bytes = await file.readAsBytes();
      if (bytes.isEmpty || bytes.length > 4 * 1024 * 1024)
        throw StateError(
          locale == 'ar' ? 'الحد الأقصى ٤ ميغابايت' : 'Maximum size is 4 MB',
        );
      final boundary = 'track-${operationId()}';
      final req = await client.postUrl(origin.resolve('/api/attachments'));
      req.followRedirects = false;
      req.cookies.add(Cookie('__Host-bt', current));
      req.headers.set('Origin', origin.origin);
      req.headers.set(
        'Content-Type',
        'multipart/form-data; boundary=$boundary',
      );
      for (final e in {
        'requestId': id,
        'purpose': purpose,
        if (purpose == 'receipt')
          'receiptKey': key
        else if (purpose != 'request')
          'uploadKey': key,
      }.entries) {
        req.add(
          utf8.encode(
            '--$boundary\r\nContent-Disposition: form-data; name="${e.key}"\r\n\r\n${e.value}\r\n',
          ),
        );
      }
      final name = file.name.replaceAll(RegExp(r'["\r\n/\\]'), '_');
      req.add(
        utf8.encode(
          '--$boundary\r\nContent-Disposition: form-data; name="file"; filename="$name"\r\nContent-Type: application/octet-stream\r\n\r\n',
        ),
      );
      req.add(bytes);
      req.add(utf8.encode('\r\n--$boundary--\r\n'));
      final res = await req.close().timeout(const Duration(seconds: 45)),
          data = jsonDecode(await utf8.decoder.bind(res).join());
      if (res.statusCode >= 300)
        throw ApiFailure(
          res.statusCode,
          data['error'] ?? 'HTTP ${res.statusCode}',
        );
      results.add({'id': data['id'], 'name': name});
    }
    return results;
  }

  Future<void> clear() async {
    await _invalidate();
    await storage.delete(key: 'sessionExpiry');
    session = null;
    await storage.delete(key: 'session');
    project.value = (id: '', name: '');
  }
}
