import 'dart:async';
import 'page_cache.dart';
import 'dart:convert';
import 'dart:io';
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

  final cache = PageCache();
  bool cacheable(String path) =>
      path == '/api/v1/pages/me' ||
      path.split('?').first == '/api/v1/pages/requests' ||
      path.startsWith('/api/v1/pages/dashboard') ||
      path.startsWith('/api/options?resource=projects') ||
      path.startsWith('/api/options?resource=materials&');
  Future<Map<String, dynamic>?> cached(String path) async {
    final current = session;
    if (current == null || !cacheable(path)) return null;
    return cache.read(current, path);
  }

  Future<Map<String, dynamic>> call(
    String path, [
    Map<String, dynamic>? data,
  ]) async {
    final current = session;
    if (data != null || current == null || !cacheable(path))
      return _network(path, data);
    try {
      final value = await _network(path);
      if (session == current) {
        final expiry = DateTime.tryParse(
          await storage.read(key: 'sessionExpiry') ?? '',
        );
        if (expiry != null) await cache.save(current, path, value, expiry);
      }
      return value;
    } on SocketException {
      final value = await cached(path);
      if (value == null) rethrow;
      return value;
    } on TimeoutException {
      final value = await cached(path);
      if (value == null) rethrow;
      return value;
    }
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
        session != null)
      await cache.erase(session!);
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

  Future<void> clear() async {
    if (session != null) await cache.erase(session!);
    await storage.delete(key: 'sessionExpiry');
    session = null;
    await storage.delete(key: 'session');
  }
}
