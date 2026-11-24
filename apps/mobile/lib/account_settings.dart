import 'package:flutter/material.dart';
import 'api.dart';
import 'section_labels.dart';
import 'track_header.dart';

class AccountSettings extends StatefulWidget {
  const AccountSettings({
    super.key,
    required this.api,
    required this.section,
    required this.title,
    required this.owner,
  });
  final TrackApi api;
  final String section, title;
  final bool owner;
  @override
  State<AccountSettings> createState() => _AccountSettingsState();
}

class _AccountSettingsState extends State<AccountSettings> {
  bool get system => widget.section == 'system';
  bool get security => widget.section == 'security';
  String t(String ar, String en) => widget.api.locale == 'ar' ? ar : en;
  bool busy = true, ready = false, otp = false;
  String error = '', current = '';
  String? next;
  final sessions = <Map>[], policies = <Map<String, dynamic>>[];
  final forced = <int>{};
  Map settings = {};
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final res = await widget.api.call(
        '/api/v1/pages/' + (system ? 'system' : 'notification-preferences'),
      );
      final sec = system ? {} : await widget.api.call('/api/v1/pages/security');
      if (!mounted) return;
      policies.clear();
      forced.clear();
      final prefs = {for (final p in res['preferences'] ?? []) p['type']: p};
      for (final p in res['policies']) {
        if (p['forced'] == true) forced.add(p['type']);
        final pref = p['forced'] == true ? p : prefs[p['type']] ?? p;
        policies.add({
          'type': p['type'],
          'inApp': pref['in_app'],
          'email': pref['email'],
          'whatsapp': pref['whatsapp'],
          if (system) 'forced': p['forced'],
        });
      }
      if (system) {
        final s = res['settings'];
        settings = {
          'otpRequired': s['otp_required'],
          'defaultTheme': s['default_theme'],
          'digits': s['digits'],
          'readNotificationDays': s['read_notification_days'],
          'whatsappEnabled': s['whatsapp_enabled'],
        };
      } else {
        otp = sec['otpEnabled'];
        current = sec['current'];
        sessions.clear();
        sessions.addAll((sec['sessions']['items'] as List).cast<Map>());
        next = sec['sessions']['next'];
      }
      ready = true;
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> run(Future<void> Function() task) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await task();
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> save() async {
    await widget.api.call('/api/commands', {
      'command': system ? 'settings' : 'preferences',
      'data': system
          ? {...settings, 'policies': policies}
          : {'otpEnabled': otp, 'preferences': policies},
    });
    if (mounted) Navigator.pop(context);
  }

  Widget toggle(String label, bool value, ValueChanged<bool>? change) =>
      SwitchListTile(
        title: Text(label),
        value: value,
        onChanged: busy ? null : change,
      );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: TrackHeader(api: widget.api, title: widget.title),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (busy) const LinearProgressIndicator(),
        if (error.isNotEmpty)
          ListTile(
            title: Text(error),
            trailing: IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: load,
            ),
          ),
        if (ready) ...[
          if (system) ...[
            toggle(
              t('الوضع الداكن الافتراضي', 'Default dark mode'),
              settings['defaultTheme'] == 1,
              (v) => setState(() => settings['defaultTheme'] = v ? 1 : 0),
            ),
            toggle(
              t('الأرقام العربية', 'Arabic numerals'),
              settings['digits'] == 1,
              (v) => setState(() => settings['digits'] = v ? 1 : 0),
            ),
            toggle(
              t('تفعيل واتساب', 'Enable WhatsApp'),
              settings['whatsappEnabled'],
              (v) => setState(() => settings['whatsappEnabled'] = v),
            ),
            toggle(
              t('فرض رمز التحقق', 'Require verification code'),
              settings['otpRequired'],
              widget.owner
                  ? (v) => setState(() => settings['otpRequired'] = v)
                  : null,
            ),
            TextFormField(
              initialValue: settings['readNotificationDays'].toString(),
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: t(
                  'مدة الاحتفاظ بالإشعارات المقروءة بالأيام',
                  'Read notification retention in days',
                ),
              ),
              onChanged: (v) =>
                  settings['readNotificationDays'] = int.tryParse(v),
            ),
          ],
          if (security) ...[
            toggle(
              t('التحقق بخطوتين', 'Two-step verification'),
              otp,
              (v) => setState(() => otp = v),
            ),
            for (final s in sessions)
              ListTile(
                title: Text(s['user_agent'] ?? ''),
                subtitle: Text(
                  [s['ip'], s['expires_at']].whereType<String>().join(' · '),
                ),
                trailing: s['id'] == current
                    ? const Icon(Icons.check)
                    : TextButton(
                        child: Text(t('إنهاء', 'Revoke')),
                        onPressed: busy
                            ? null
                            : () => run(() async {
                                await widget.api.call('/api/commands', {
                                  'command': 'revoke-session',
                                  'data': {'id': s['id']},
                                });
                                sessions.remove(s);
                              }),
                      ),
              ),
            if (next != null)
              TextButton(
                child: Text(t('المزيد', 'More')),
                onPressed: busy
                    ? null
                    : () => run(() async {
                        final r = await widget.api.call(
                          Uri(
                            path: '/api/v1/pages/security',
                            queryParameters: {'cursor': next!},
                          ).toString(),
                        );
                        sessions.addAll(
                          (r['sessions']['items'] as List).cast<Map>(),
                        );
                        next = r['sessions']['next'];
                      }),
              ),
          ] else
            for (final p in policies)
              ExpansionTile(
                title: Text(
                  (widget.api.locale == 'ar'
                      ? notificationsArabic
                      : notificationsEnglish)[p['type']],
                ),
                children: [
                  for (final entry in {
                    'inApp': t('داخل التطبيق', 'In app'),
                    'email': t('البريد الإلكتروني', 'Email'),
                    'whatsapp': t('واتساب', 'WhatsApp'),
                    if (system) 'forced': t('إلزامي', 'Required'),
                  }.entries)
                    toggle(
                      entry.value,
                      p[entry.key],
                      !system && forced.contains(p['type'])
                          ? null
                          : (v) => setState(() => p[entry.key] = v),
                    ),
                ],
              ),
          FilledButton(
            onPressed: busy ? null : () => run(save),
            child: Text(t('حفظ', 'Save')),
          ),
        ],
      ],
    ),
  );
}
