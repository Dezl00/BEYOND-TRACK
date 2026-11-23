import 'workspace.dart';
import 'theme_reveal.dart';
import 'submissions.dart';
import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'device_notifications.dart';
import 'overview.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'api.dart';

void main() => runApp(const TrackApp());
const blue = Color(0xff0759ea);

ColorScheme trackColors(bool dark) {
  final day = ColorScheme.fromSeed(seedColor: blue);
  return dark
      ? day.copyWith(
          brightness: Brightness.dark,
          surface: Colors.black,
          onSurface: Colors.white,
          surfaceContainerLowest: Colors.black,
          surfaceContainerLow: Colors.black,
          surfaceContainer: Colors.black,
          surfaceContainerHigh: Colors.black,
          surfaceContainerHighest: Colors.black,
          onSurfaceVariant: const Color(0xffc6c6c6),
          surfaceTint: Colors.transparent,
          outlineVariant: const Color(0xff383838),
        )
      : day;
}

class TrackApp extends StatefulWidget {
  const TrackApp({super.key});
  @override
  State<TrackApp> createState() => _TrackAppState();
}

class _TrackAppState extends State<TrackApp> with WidgetsBindingObserver {
  final api = TrackApi();
  final reveal = GlobalKey<ThemeRevealState>();
  bool choosingFile = false;
  late final devicePush = DeviceNotifications(api);
  bool pushEnabled = false, pushBusy = false;
  Future<void> restorePush() async {
    final user = profile?['id'], session = api.session;
    if (!mounted ||
        pushBusy ||
        user == null ||
        profile?['force_password_change'] == true)
      return;
    setState(() => pushBusy = true);
    try {
      final enabled = await api.storage.read(key: 'notify:$user') != '0';
      if (!mounted || session != api.session) return;
      if (enabled)
        await devicePush.update(user, true, requestPermission: false);
      if (mounted && session == api.session)
        setState(() => pushEnabled = enabled);
    } catch (e) {
      if (mounted && session == api.session)
        setState(() {
          error = e.toString();
          pushEnabled = false;
        });
    } finally {
      if (mounted) setState(() => pushBusy = false);
    }
  }

  Future<void> togglePush(bool value) async {
    if (pushBusy) return;
    setState(() {
      pushBusy = true;
      pushEnabled = value;
    });
    try {
      await devicePush.update(profile!['id'], value);
    } catch (e) {
      pushEnabled = !value;
      error = e.toString();
    } finally {
      if (mounted) setState(() => pushBusy = false);
    }
  }

  final messenger = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription<RemoteMessage>? foregroundMessage;
  String? notifiedRequest;
  StreamSubscription<RemoteMessage>? openedMessage;
  void receiveLink(RemoteMessage message) {
    final id = message.data['requestId'];
    if (id is String && RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(id) && mounted) {
      setState(() => notifiedRequest = id);
    }
  }

  Future<void> listenForLinks() async {
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
      if (!mounted) return;
      foregroundMessage = FirebaseMessaging.onMessage.listen((message) {
        if (locked || profile == null || !pushEnabled) return;
        final title = message.notification?.title;
        if (title == null) return;
        const MethodChannel(
          'online.beyondtrack.app/device',
        ).invokeMethod<void>('foregroundTone');
        messenger.currentState?.showSnackBar(
          SnackBar(
            content: Text(title),
            action: SnackBarAction(
              label: t('عرض', 'View'),
              onPressed: () => receiveLink(message),
            ),
          ),
        );
      });
      openedMessage = FirebaseMessaging.onMessageOpenedApp.listen(receiveLink);
      final message = await FirebaseMessaging.instance.getInitialMessage();
      if (message != null) receiveLink(message);
    } catch (_) {
      /* Login remains available if Google Play services are unavailable. */
    }
  }

  SubmissionQueue? queue;
  Timer? syncTimer;
  void startSync() {
    final session = api.session;
    if (profile == null || session == null) return;
    queue?.active = false;
    queue = SubmissionQueue(api, profile!['id'], session);
    syncTimer?.cancel();
    void synchronize() {
      if (!locked && profile?['force_password_change'] != true)
        unawaited(queue!.flush());
    }

    syncTimer = Timer.periodic(
      const Duration(seconds: 12),
      (_) => synchronize(),
    );
    synchronize();
  }

  bool viewingAccount = false;
  final id = TextEditingController(),
      password = TextEditingController(),
      code = TextEditingController();
  bool locked = true,
      authenticating = false,
      busy = false,
      dark = false,
      visible = false;
  String locale = 'ar', mode = 'login', challenge = '', error = '';
  Map<String, dynamic>? profile;
  String t(String ar, String en) => locale == 'ar' ? ar : en;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await devicePush.firstLaunch();
      unawaited(listenForLinks());
      if (mounted) await unlock();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused &&
        !choosingFile &&
        !authenticating &&
        !locked)
      setState(() => locked = true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    syncTimer?.cancel();
    queue?.active = false;
    openedMessage?.cancel();
    foregroundMessage?.cancel();
    id.dispose();
    password.dispose();
    code.dispose();
    devicePush.detach();
    api.client.close();
    super.dispose();
  }

  Future<void> unlock() async {
    if (authenticating) return;
    authenticating = true;
    try {
      final ok = await const MethodChannel(
        'online.beyondtrack.app/device',
      ).invokeMethod<bool>('unlock');
      if (ok != true) {
        setState(
          () => error = t(
            'فعّل قفل الجهاز ثم أعد المحاولة',
            'Enable a device lock and retry',
          ),
        );
        return;
      }
      locale = await api.storage.read(key: 'locale') ?? 'ar';
      api.locale = locale;
      dark = await api.storage.read(key: 'theme') == 'dark';
      api.session = await api.storage.read(key: 'session');
      if (api.session != null) {
        try {
          profile = await api.call('/api/v1/pages/me');
          unawaited(restorePush());
        } catch (e) {
          viewingAccount = false;
          profile = null;
          setState(() => error = e.toString());
        }
      }
      setState(() => locked = false);
      startSync();
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      authenticating = false;
    }
  }

  Future<void> savingDisplay = Future.value();
  Future<void> preferences({String? language, bool? night}) async {
    if (night != null && night != dark) reveal.currentState?.start();
    setState(() {
      locale = language ?? locale;
      dark = night ?? dark;
      api.locale = locale;
    });
    final selectedLocale = locale, selectedTheme = dark ? 'dark' : 'light';
    final session = api.session;
    savingDisplay = savingDisplay
        .then((_) async {
          await api.storage.write(key: 'locale', value: selectedLocale);
          await api.storage.write(key: 'theme', value: selectedTheme);
          if (session != null && session == api.session) {
            await api.call('/api/auth/display', {
              'locale': selectedLocale,
              'theme': selectedTheme,
            });
          }
        })
        .catchError((Object e) {
          if (mounted && session == api.session)
            setState(() => error = e.toString());
        });
    await savingDisplay;
  }

  Future<void> submit() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final data = switch (mode) {
        'otp' => {'challenge': challenge, 'code': code.text.trim()},
        'forgot' => {'email': id.text.trim()},
        'reset' => {
          'challenge': challenge,
          'code': code.text.trim(),
          'password': password.text,
        },
        _ => {
          'identifier': id.text.trim(),
          'password': password.text,
          'remember': true,
        },
      };
      final result = await api.call('/api/auth/$mode', data);
      if (mode == 'forgot' ||
          (mode == 'login' && result['challenge'] != null)) {
        challenge = result['challenge'] as String;
        mode = mode == 'forgot' ? 'reset' : 'otp';
        password.clear();
        code.clear();
      } else if (mode == 'reset') {
        mode = 'login';
        if (profile != null) startSync();
        password.clear();
        code.clear();
      } else {
        profile = await api.call('/api/v1/pages/me');
        unawaited(restorePush());
        password.clear();
        code.clear();
        mode = 'login';
        if (profile != null) startSync();
      }
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> logout(BuildContext context) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(t('تسجيل الخروج؟', 'Sign out?')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: Text(t('إلغاء', 'Cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: Text(t('خروج', 'Sign out')),
          ),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await api.call('/api/auth/logout', {});
      devicePush.detach();
      pushEnabled = false;
      notifiedRequest = null;
      sectionPath = null;
      syncTimer?.cancel();
      queue?.active = false;
      queue = null;
      await api.clear();
      setState(() {
        viewingAccount = false;
        profile = null;
        error = '';
      });
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Widget logo() => SvgPicture.asset(
    'assets/brand/${dark ? 'logo-dark' : 'logo'}.svg',
    width: 112,
  );
  @override
  Widget build(BuildContext context) {
    final day = trackColors(false), scheme = trackColors(dark);
    return MaterialApp(
      key: ValueKey(locked),
      scaffoldMessengerKey: messenger,
      debugShowCheckedModeBanner: false,
      locale: Locale(locale),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      themeAnimationDuration: Duration.zero,
      builder: (_, child) => ThemeReveal(key: reveal, child: child!),
      theme: ThemeData(
        colorScheme: scheme,
        fontFamily: locale == 'ar' ? 'IBM Plex Sans Arabic' : 'IBM Plex Sans',
        scaffoldBackgroundColor: dark ? Colors.black : Colors.white,
        chipTheme: ChipThemeData(
          backgroundColor: day.surfaceContainerLow,
          labelStyle: TextStyle(color: day.onSurface),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: dark ? Colors.black : const Color(0xfff1f3f6),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(9),
            borderSide: BorderSide.none,
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: blue,
            foregroundColor: Colors.white,
            minimumSize: const Size(48, 48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(9),
            ),
          ),
        ),
      ),
      home: Builder(
        builder: (ctx) => locked
            ? Scaffold(
                body: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      logo(),
                      const SizedBox(height: 24),
                      FilledButton.icon(
                        onPressed: unlock,
                        icon: const Icon(Icons.fingerprint),
                        label: Text(t('فتح التطبيق', 'Unlock app')),
                      ),
                      Text(error),
                    ],
                  ),
                ),
              )
            : profile == null
            ? login()
            : notifiedRequest != null &&
                  profile!['force_password_change'] != true
            ? workspace(
                '/requests/$notifiedRequest',
                () => setState(() => notifiedRequest = null),
              )
            : sectionPath != null && profile!['force_password_change'] != true
            ? workspace(sectionPath!, () => setState(() => sectionPath = null))
            : (viewingAccount || profile!['force_password_change'] == true)
            ? PopScope(
                canPop: false,
                onPopInvokedWithResult: (p, r) {
                  if (!p) setState(() => viewingAccount = false);
                },
                child: account(ctx),
              )
            : !(profile!['navigation'] as List).any(
                (n) => n['key'] == 'dashboard',
              )
            ? workspace('/more', () => setState(() => viewingAccount = true))
            : Overview(
                api: api,
                queue: queue,
                openRequest: (id) => setState(() => notifiedRequest = id),
                canCreate: (profile!['permissions'] as List).contains(
                  'requests.create',
                ),
                name: profile!['name'],
                arabic: locale == 'ar',
                openSections: (project) => setState(() {
                  sectionPath = project.isEmpty
                      ? '/more'
                      : '/more?project=${Uri.encodeQueryComponent(project)}';
                }),
                openAccount: () => setState(() => viewingAccount = true),
              ),
      ),
    );
  }

  Widget login() {
    final title = switch (mode) {
      'otp' => t('رمز التحقق', 'Verification code'),
      'forgot' => t('استعادة الحساب', 'Recover account'),
      'reset' => t('تعيين كلمة مرور جديدة', 'Reset password'),
      _ => t('تسجيل الدخول', 'Sign in'),
    };
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.language),
          onPressed: () => preferences(language: locale == 'ar' ? 'en' : 'ar'),
        ),
        actions: [
          IconButton(
            icon: Icon(
              dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
            ),
            onPressed: () => preferences(night: !dark),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 28),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(child: logo()),
                    const SizedBox(height: 32),
                    Text(title, style: const TextStyle(fontSize: 22)),
                    const SizedBox(height: 16),
                    if (mode == 'login' || mode == 'forgot')
                      TextField(
                        controller: id,
                        autofillHints: [
                          mode == 'forgot'
                              ? AutofillHints.email
                              : AutofillHints.username,
                        ],
                        decoration: InputDecoration(
                          labelText: mode == 'forgot'
                              ? t('البريد الإلكتروني', 'Email')
                              : t(
                                  'اسم المستخدم أو الهاتف',
                                  'Username or phone',
                                ),
                        ),
                      ),
                    if (mode == 'otp' || mode == 'reset')
                      TextField(
                        controller: code,
                        textDirection: TextDirection.ltr,
                        keyboardType: TextInputType.number,
                        autofillHints: const [AutofillHints.oneTimeCode],
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(6),
                        ],
                        decoration: InputDecoration(
                          labelText: t('رمز التحقق', 'Verification code'),
                        ),
                      ),
                    if (mode == 'login' || mode == 'reset') ...[
                      const SizedBox(height: 16),
                      TextField(
                        controller: password,
                        obscureText: !visible,
                        autofillHints: [
                          mode == 'reset'
                              ? AutofillHints.newPassword
                              : AutofillHints.password,
                        ],
                        decoration: InputDecoration(
                          labelText: t('كلمة المرور', 'Password'),
                          suffixIcon: IconButton(
                            icon: Icon(
                              visible ? Icons.visibility_off : Icons.visibility,
                            ),
                            onPressed: () => setState(() => visible = !visible),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: busy ? null : submit,
                      child: Text(busy ? '…' : title),
                    ),
                    TextButton(
                      onPressed: busy
                          ? null
                          : () => setState(() {
                              mode = mode == 'login' ? 'forgot' : 'login';
                              error = '';
                              password.clear();
                              code.clear();
                            }),
                      child: Text(
                        mode == 'login'
                            ? t('نسيت كلمة المرور؟', 'Forgot password?')
                            : t('العودة للدخول', 'Back to sign in'),
                      ),
                    ),
                    if (error.isNotEmpty) Text(error),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> changePassword(BuildContext context) async {
    String current = '', next = '';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(t('تغيير كلمة المرور', 'Change password')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              obscureText: true,
              onChanged: (v) => current = v,
              decoration: InputDecoration(
                labelText: t('كلمة المرور الحالية', 'Current password'),
              ),
            ),
            TextField(
              obscureText: true,
              onChanged: (v) => next = v,
              decoration: InputDecoration(
                labelText: t('كلمة المرور الجديدة', 'New password'),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: Text(t('إلغاء', 'Cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: Text(t('حفظ', 'Save')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await api.call('/api/commands', {
        'command': 'password',
        'data': {'current': current, 'password': next},
      });
      profile = await api.call('/api/v1/pages/me');
      unawaited(restorePush());
      setState(() => error = '');
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  String? sectionPath;
  Widget workspace(String path, VoidCallback close) => Workspace(
    key: ValueKey(path),
    api: api,
    path: path,
    dark: dark,
    close: () async {
      final session = api.session;
      close();
      try {
        final me = await api.call('/api/v1/pages/me');
        if (!mounted || session != api.session || profile == null) return;
        final language = me['locale'] == 'en' ? 'en' : 'ar';
        final night = me['theme'] == 1;
        setState(() {
          profile = me;
          locale = api.locale = language;
          dark = night;
        });
        await api.storage.write(key: 'locale', value: language);
        await api.storage.write(key: 'theme', value: night ? 'dark' : 'light');
      } catch (e) {
        if (mounted && session == api.session)
          setState(() => error = e.toString());
      }
    },
    choosingFile: (value) => choosingFile = value,
    rotated: () {
      startSync();
      unawaited(restorePush());
    },
    expired: () async {
      devicePush.detach();
      syncTimer?.cancel();
      queue?.active = false;
      await api.clear();
      if (mounted)
        setState(() {
          profile = null;
          notifiedRequest = null;
          sectionPath = null;
          viewingAccount = false;
        });
    },
  );
  Widget account(BuildContext context) {
    final me = profile!;
    Widget tile(
      IconData icon,
      String title, {
      String? value,
      Widget? control,
      VoidCallback? tap,
    }) => ListTile(
      leading: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: const Color(0xffedf5fe),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Icon(icon, color: blue),
      ),
      title: Text(title, style: const TextStyle(fontSize: 16)),
      subtitle: value == null ? null : Text(value),
      trailing: control,
      onTap: tap,
    );
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              me['name'] as String,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            Text('${me['role_name']}'),
            if (me['force_password_change'] != true)
              tile(
                Icons.apps,
                t('أقسام العمل', 'Workspace'),
                tap: () => setState(() => sectionPath = '/more'),
              ),
            const SizedBox(height: 20),
            tile(
              Icons.email_outlined,
              t('البريد الإلكتروني', 'Email'),
              value: me['email'],
            ),
            tile(
              Icons.language,
              t('اللغة', 'Language'),
              value: locale == 'ar' ? 'العربية' : 'English',
              tap: () => preferences(language: locale == 'ar' ? 'en' : 'ar'),
            ),
            tile(
              Icons.dark_mode_outlined,
              t('الوضع الداكن', 'Dark mode'),
              control: Switch(
                activeTrackColor: const Color(0xff218552),
                value: dark,
                onChanged: (v) => preferences(night: v),
              ),
            ),
            tile(
              Icons.notifications_outlined,
              t('إشعارات الجهاز', 'Push notifications'),
              control: Switch(
                value: pushEnabled,
                onChanged: pushBusy ? null : togglePush,
              ),
            ),
            tile(
              Icons.lock_outline,
              t('حماية الجهاز', 'Device protection'),
              value: t('إجبارية', 'Required'),
            ),
            tile(
              Icons.password,
              t('تغيير كلمة المرور', 'Change password'),
              tap: () => changePassword(context),
            ),
            tile(
              Icons.logout,
              t('تسجيل الخروج', 'Sign out'),
              tap: () => logout(context),
            ),
            if (error.isNotEmpty) Text(error),
          ],
        ),
      ),
    );
  }
}
