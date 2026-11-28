import 'sections.dart';
import 'track_widgets.dart';
import 'page_motion.dart';
import 'account_settings.dart';
import 'track_header.dart';
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

  late final devicePush = DeviceNotifications(api);
  bool pushEnabled = false, pushBusy = false;
  String pushError = '';
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
      final authorized = enabled && await devicePush.authorized();
      if (authorized)
        await devicePush.update(user, true, requestPermission: false);
      if (mounted && session == api.session)
        setState(() {
          pushEnabled = authorized;
          pushError = '';
        });
    } catch (e) {
      if (mounted && session == api.session)
        setState(() {
          pushError = e.toString();
          pushEnabled = false;
        });
    } finally {
      if (mounted) setState(() => pushBusy = false);
    }
  }

  Future<void> togglePush(bool value) async {
    if (pushBusy || profile == null) return;
    final session = api.session;
    setState(() {
      pushBusy = true;
      pushError = '';
    });
    try {
      await devicePush.update(profile!['id'], value);
      if (mounted && session == api.session)
        setState(() => pushEnabled = value);
    } on NotificationPermissionDenied {
      if (mounted && session == api.session) {
        setState(() => pushEnabled = false);
        messenger.currentState?.showSnackBar(
          SnackBar(
            content: Text(
              t(
                'يحتاج التطبيق إلى إذن الإشعارات',
                'Notification permission is required',
              ),
            ),
            action: SnackBarAction(
              label: t('الإعدادات', 'Settings'),
              onPressed: devicePush.openSettings,
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted && session == api.session)
        setState(() => pushError = e.toString());
    } finally {
      if (mounted) setState(() => pushBusy = false);
    }
  }

  final homePage = GlobalKey();
  final messenger = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription<RemoteMessage>? foregroundMessage;
  String? notifiedRequest;
  StreamSubscription<RemoteMessage>? openedMessage;
  void receiveLink(RemoteMessage message) {
    final id = message.data['requestId'];
    if (id is String && RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(id) && mounted) {
      final home = homePage.currentContext;
      if (home != null) Navigator.of(home).popUntil((route) => route.isFirst);
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
        !api.pickingFile &&
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

  Future<Map<String, dynamic>> loadProfile() async {
    final me = await api.page('/api/v1/pages/me', force: true);
    if (me['force_password_change'] != true &&
        (me['navigation'] as List).any((item) => item['key'] == 'dashboard')) {
      // On a first visit keep the sign-in/unlock screen until the dashboard is ready.
      try {
        await api.prepare(sectionPath('dashboard', api.project.value.id));
      } on ApiFailure catch (e) {
        if (e.status == 401) rethrow;
      } on Exception {
        /* The home screen provides a retry when offline. */
      }
    }
    return me;
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
          profile = await loadProfile();
          unawaited(restorePush());
        } catch (e) {
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
        profile = await loadProfile();
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
      pushError = '';
      notifiedRequest = null;
      syncTimer?.cancel();
      queue?.active = false;
      queue = null;
      await api.clear();
      setState(() {
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
      builder: (_, child) => Directionality(
        textDirection: locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
        child: ThemeReveal(key: reveal, child: child!),
      ),
      theme: ThemeData(
        colorScheme: scheme.copyWith(shadow: Colors.transparent),
        shadowColor: Colors.transparent,
        pageTransitionsTheme: const PageTransitionsTheme(
          builders: {TargetPlatform.android: DirectionalPageMotion()},
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            backgroundColor: scheme.onSurface.withValues(alpha: .05),
            side: BorderSide.none,
          ),
        ),
        switchTheme: SwitchThemeData(
          trackColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? trackGreen : null,
          ),
          thumbColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? Colors.white : null,
          ),
        ),
        segmentedButtonTheme: SegmentedButtonThemeData(
          style: ButtonStyle(
            shape: const WidgetStatePropertyAll(StadiumBorder()),
            foregroundColor: WidgetStateProperty.resolveWith(
              (s) => s.contains(WidgetState.selected)
                  ? Colors.white
                  : scheme.onSurface,
            ),
            side: const WidgetStatePropertyAll(BorderSide.none),
            backgroundColor: WidgetStateProperty.resolveWith(
              (s) => s.contains(WidgetState.selected)
                  ? blue
                  : scheme.onSurface.withValues(alpha: .05),
            ),
          ),
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: blue,
          foregroundColor: Colors.white,
          elevation: 0,
          focusElevation: 0,
          hoverElevation: 0,
          highlightElevation: 0,
          disabledElevation: 0,
        ),
        dividerTheme: const DividerThemeData(color: Colors.transparent),
        expansionTileTheme: const ExpansionTileThemeData(
          shape: Border(),
          collapsedShape: Border(),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: blue,
          foregroundColor: Colors.white,
          toolbarHeight: 72,
          elevation: 0,
          scrolledUnderElevation: 0,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
          ),
        ),
        fontFamily: locale == 'ar' ? 'IBM Plex Sans Arabic' : 'IBM Plex Sans',
        scaffoldBackgroundColor: dark ? Colors.black : Colors.white,
        chipTheme: ChipThemeData(
          side: BorderSide.none,
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
            elevation: 0,
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
        key: homePage,
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
                      legalLinks(),
                      Text(error),
                    ],
                  ),
                ),
              )
            : profile == null
            ? login(ctx)
            : notifiedRequest != null &&
                  profile!['force_password_change'] != true
            ? PopScope(
                canPop: false,
                onPopInvokedWithResult: (popped, _) {
                  if (!popped) setState(() => notifiedRequest = null);
                },
                child: RequestDetail(
                  api: api,
                  id: notifiedRequest!,
                  close: () => setState(() => notifiedRequest = null),
                ),
              )
            : profile!['force_password_change'] == true
            ? account(ctx)
            : Overview(
                key: ValueKey(profile!['id']),
                api: api,
                queue: queue,
                profile: profile!,
                arabic: locale == 'ar',
                account: account(ctx),
              ),
      ),
    );
  }

  Widget languageControl() => SegmentedButton<String>(
    showSelectedIcon: false,
    segments: const [
      ButtonSegment(value: 'ar', label: Text('AR')),
      ButtonSegment(value: 'en', label: Text('EN')),
    ],
    selected: {locale},
    onSelectionChanged: (v) => preferences(language: v.single),
  );
  Widget appearanceControl() => SegmentedButton<bool>(
    showSelectedIcon: false,
    segments: [
      ButtonSegment(
        value: false,
        icon: const Icon(Icons.light_mode_outlined),
        tooltip: t('فاتح', 'Light'),
      ),
      ButtonSegment(
        value: true,
        icon: const Icon(Icons.dark_mode_outlined),
        tooltip: t('داكن', 'Dark'),
      ),
    ],
    selected: {dark},
    onSelectionChanged: (v) => preferences(night: v.single),
  );

  Widget login(BuildContext context) {
    final title = switch (mode) {
      'otp' => t('رمز التحقق', 'Verification code'),
      'forgot' => t('استعادة الحساب', 'Recover account'),
      'reset' => t('تعيين كلمة مرور جديدة', 'Reset password'),
      _ => t('تسجيل الدخول', 'Sign in'),
    };
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.surface,
        title: FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(
            children: [
              languageControl(),
              const SizedBox(width: 8),
              appearanceControl(),
            ],
          ),
        ),
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
                    legalLinks(),
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

  Widget legalLinks() => Wrap(
    alignment: WrapAlignment.center,
    children: [
      for (final item in [
        ('privacy', t('سياسة الخصوصية', 'Privacy policy')),
        ('terms', t('الشروط والأحكام', 'Terms and conditions')),
      ])
        TextButton(
          child: Text(item.$2),
          onPressed: () async {
            try {
              await const MethodChannel('online.beyondtrack.app/device')
                  .invokeMethod<void>('openLegalPage', item.$1);
            } on PlatformException {
              messenger.currentState?.showSnackBar(
                SnackBar(content: SelectableText('https://www.beyond-track.online/' + item.$1)),
              );
            }
          },
        ),
    ],
  );

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
      profile = await loadProfile();
      unawaited(restorePush());
      setState(() => error = '');
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

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
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          Container(
            width: double.infinity,
            padding: EdgeInsets.fromLTRB(
              16,
              MediaQuery.paddingOf(context).top + 20,
              16,
              22,
            ),
            decoration: const BoxDecoration(
              color: blue,
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
            ),
            child: Column(
              children: [
                const CircleAvatar(
                  radius: 28,
                  backgroundColor: Color(0x33ffffff),
                  child: Icon(
                    Icons.person_rounded,
                    color: Colors.white,
                    size: 34,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  me['name'],
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 19,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 5),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      vertical: 3,
                      horizontal: 12,
                    ),
                    child: Text(
                      (me['job_title'] as String?)?.trim().isNotEmpty == true
                          ? me['job_title']
                          : me['role_name'],
                      style: const TextStyle(color: blue, fontSize: 12),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          tile(
            Icons.email_outlined,
            t('البريد الإلكتروني', 'Email'),
            value: me['email'],
          ),
          ListTile(
            title: Text(t('اللغة', 'Language')),
            trailing: languageControl(),
          ),
          ListTile(
            title: Text(t('المظهر', 'Appearance')),
            trailing: appearanceControl(),
          ),
          tile(
            Icons.notifications_outlined,
            t('إشعارات الجهاز', 'Push notifications'),
            control: Switch(
              value: pushEnabled,
              onChanged: pushBusy ? null : togglePush,
            ),
          ),
          if (pushError.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(pushError),
            ),
          if (me['force_password_change'] != true)
            for (final item in [
              (
                'security',
                Icons.security,
                t('الأمان والجلسات', 'Security and sessions'),
              ),
              (
                'notification-preferences',
                Icons.tune,
                t('تفضيلات الإشعارات', 'Notification preferences'),
              ),
              if (me['is_owner'] == true ||
                  (me['permissions'] as List).contains('settings.edit'))
                (
                  'system',
                  Icons.settings,
                  t('إعدادات النظام', 'System settings'),
                ),
            ])
              tile(
                item.$2,
                item.$3,
                tap: () async {
                  final paths = item.$1 == 'system'
                      ? ['/api/v1/pages/system']
                      : [
                          '/api/v1/pages/security',
                          '/api/v1/pages/notification-preferences',
                        ];
                  if (!await prepareNavigation(context, api, paths) ||
                      !context.mounted)
                    return;
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => AccountSettings(
                        api: api,
                        section: item.$1,
                        title: item.$3,
                        owner: me['is_owner'] == true,
                      ),
                    ),
                  );
                },
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
          legalLinks(),
          if (error.isNotEmpty) Text(error),
        ],
      ),
    );
  }
}
