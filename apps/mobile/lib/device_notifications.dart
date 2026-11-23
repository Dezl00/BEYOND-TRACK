import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api.dart';

class DeviceNotifications {
  final TrackApi api;
  DeviceNotifications(this.api);
  StreamSubscription<String>? refresh;
  String? registered;
  Future<void> update(
    String user,
    bool enabled, {
    bool requestPermission = true,
  }) async {
    await refresh?.cancel();
    if (Firebase.apps.isEmpty) await Firebase.initializeApp();
    final messaging = FirebaseMessaging.instance;
    if (enabled) {
      final permission = requestPermission
          ? await messaging.requestPermission()
          : await messaging.getNotificationSettings();
      if (permission.authorizationStatus != AuthorizationStatus.authorized)
        throw StateError(
          api.locale == 'ar'
              ? 'فعّل إذن الإشعارات من إعدادات الجهاز'
              : 'Allow notifications in Android settings',
        );
      final token = await messaging.getToken();
      if (token == null) throw StateError('FCM token unavailable');
      await api.call('/api/v1/android/push', {'token': token});
      registered = token;
      final session = api.session;
      refresh = messaging.onTokenRefresh.listen((token) async {
        if (api.session != session) return;
        try {
          await api.call('/api/v1/android/push', {'token': token});
          registered = token;
        } catch (_) {
          /* Retry registration on the next unlock. */
        }
      });
    } else {
      final token = registered ?? await messaging.getToken();
      if (token != null)
        await api.call('/api/v1/android/push', {
          'token': token,
          'remove': true,
        });
      await messaging.deleteToken();
      registered = null;
    }
    await api.storage.write(key: 'notify:$user', value: enabled ? '1' : '0');
  }

  void detach() {
    refresh?.cancel();
    refresh = null;
    registered = null;
  }
}
