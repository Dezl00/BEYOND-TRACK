import 'dart:async';
import 'package:flutter/material.dart';
import 'api.dart';
import 'request_form.dart';
import 'requests_list.dart';
import 'section_labels.dart';
import 'sections.dart';
import 'submissions.dart';
import 'track_header.dart';

class Overview extends StatefulWidget {
  const Overview({
    super.key,
    required this.api,
    required this.profile,
    required this.arabic,
    required this.queue,
    required this.account,
  });
  final TrackApi api;
  final Map<String, dynamic> profile;
  final bool arabic;
  final SubmissionQueue? queue;
  final Widget account;
  @override
  State<Overview> createState() => _OverviewState();
}

class _OverviewState extends State<Overview>
    with SingleTickerProviderStateMixin {
  String active = 'home';
  String? outgoing;
  final visited = {'home'};
  int intent = 0, generation = 0;
  double direction = 1;
  late final motion =
      AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 205),
      )..addStatusListener((status) {
        if (status == AnimationStatus.completed)
          setState(() => outgoing = null);
      });
  Map<String, dynamic>? dashboard;
  String issue = '';
  String get project => widget.api.project.value.id;
  Set<String> get navigation => (widget.profile['navigation'] as List)
      .map((n) => n['key'] as String)
      .toSet();
  bool get canCreate =>
      (widget.profile['permissions'] as List).contains('requests.create') &&
      widget.queue != null;
  String t(String ar, String en) => widget.arabic ? ar : en;
  List<String> get tabs => [
    'home',
    if (navigation.contains('requests')) 'requests',
    'sections',
    'account',
  ];
  Map<String, String> get labels => {
    'home': t('الرئيسية', 'Home'),
    'requests': t('الطلبات', 'Requests'),
    'sections': t('الأقسام', 'Sections'),
    'account': t('الحساب', 'Account'),
  };
  String navKey(String key) => tabs.contains(key) ? key : 'sections';
  bool get hasStats => navigation.contains('dashboard');
  String get dashboardPath => sectionPath('dashboard', project);

  @override
  void initState() {
    super.initState();
    dashboard = widget.api.snapshot(dashboardPath);
    widget.api.project.addListener(projectChanged);
    widget.api.changes.addListener(refreshHome);
    widget.queue?.addListener(queueChanged);
    refreshHome();
    warmRequests();
  }

  void warmRequests() {
    if (navigation.contains('requests')) {
      unawaited(
        widget.api
            .prepare(sectionPath('requests', project))
            .catchError((Object _) {}),
      );
    }
  }

  @override
  void didUpdateWidget(Overview old) {
    super.didUpdateWidget(old);
    if (old.queue != widget.queue) {
      old.queue?.removeListener(queueChanged);
      widget.queue?.addListener(queueChanged);
    }
    if (old.arabic != widget.arabic) projectChanged();
  }

  void queueChanged() {
    if (mounted) setState(() {});
  }

  void projectChanged() {
    intent++;
    setState(() {
      dashboard = widget.api.snapshot(dashboardPath);
    });
    refreshHome();
    warmRequests();
  }

  void refreshHome() {
    unawaited(loadHome());
  }

  Future<void> loadHome({bool force = false}) async {
    if (!hasStats) return;
    final revision = ++generation;
    void apply(Map<String, dynamic> page) {
      if (mounted && revision == generation)
        setState(() {
          dashboard = page;
          issue = '';
        });
    }

    try {
      apply(await widget.api.page(dashboardPath, force: force, preview: apply));
    } catch (e) {
      if (mounted && revision == generation)
        setState(() {
          if (e is ApiFailure && [401, 403, 404].contains(e.status))
            dashboard = null;
          issue = e.toString();
        });
    }
  }

  @override
  void dispose() {
    widget.api.project.removeListener(projectChanged);
    widget.api.changes.removeListener(refreshHome);
    widget.queue?.removeListener(queueChanged);
    motion.dispose();
    super.dispose();
  }

  Future<void> select(String key) async {
    final ticket = ++intent;
    if (active == key) return;
    if (!tabs.contains(key) && !allowedSections(widget.profile).contains(key))
      return;
    final path = key == 'home'
        ? (hasStats ? dashboardPath : null)
        : ['account', 'sections'].contains(key)
        ? null
        : sectionPath(key, project);
    if (path != null &&
        (!await prepareNavigation(context, widget.api, [path]) ||
            !mounted ||
            ticket != intent))
      return;
    final oldIndex = tabs.indexOf(navKey(active)),
        newIndex = tabs.indexOf(navKey(key));
    setState(() {
      outgoing = active;
      direction =
          newIndex < oldIndex || (newIndex == oldIndex && key == 'sections')
          ? -1
          : 1;
      visited.removeWhere((item) => !tabs.contains(item) && item != outgoing);
      visited.add(key);
      active = key;
    });
    motion.forward(from: 0);
    if (key == 'home') refreshHome();
  }

  void open(String key) => select(key == 'settings' ? 'account' : key);
  Future<void> createRequest() async {
    if (project.isEmpty) await chooseProject(context, widget.api);
    if (!mounted || project.isEmpty) return;
    final sent = await openRequestForm(
      context,
      widget.api,
      widget.queue!,
      project,
      widget.arabic,
    );
    if (!mounted || sent != true) return;
    final pending = await widget.queue!.items();
    if (mounted)
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            pending.isEmpty
                ? t('تم الإرسال', 'Submitted')
                : t('راجع قائمة الإرسال', 'Check submission queue'),
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final tab = navKey(active);
    return PopScope(
      canPop: active == 'home',
      onPopInvokedWithResult: (popped, _) {
        if (!popped) select(tabs.contains(active) ? 'home' : 'sections');
      },
      child: Scaffold(
        appBar: active == 'account' || !tabs.contains(active)
            ? null
            : TrackHeader(
                api: widget.api,
                home: active == 'home',
                primary: true,
                title: active == 'home'
                    ? widget.profile['name']
                    : labels[active]!,
                account: () => select('account'),
                notifications: navigation.contains('notifications')
                    ? () => select('notifications')
                    : null,
              ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: NavigationBar(
            elevation: 0,
            height: 64,
            selectedIndex: tabs.indexOf(tab),
            onDestinationSelected: (i) => select(tabs[i]),
            destinations: [
              for (final k in tabs)
                NavigationDestination(
                  icon: Icon(
                    {
                      'home': Icons.home_outlined,
                      'requests': Icons.receipt_long_outlined,
                      'sections': Icons.grid_view_rounded,
                      'account': Icons.person_outline,
                    }[k],
                  ),
                  label: labels[k]!,
                ),
            ],
          ),
        ),
        floatingActionButton: active == 'requests' && canCreate
            ? FloatingActionButton(
                tooltip: t('طلب جديد', 'New request'),
                onPressed: createRequest,
                child: const Icon(Icons.add),
              )
            : null,
        body: ClipRect(
          child: Stack(
            fit: StackFit.expand,
            children: [
              for (final key in visited)
                Offstage(
                  key: ValueKey(key),
                  offstage: key != active && key != outgoing,
                  child: TickerMode(
                    enabled: key == active || key == outgoing,
                    child: IgnorePointer(
                      ignoring: key != active,
                      child: AnimatedBuilder(
                        animation: motion,
                        child: pageBody(key),
                        builder: (ctx, child) {
                          final progress = Curves.easeOutCubic.transform(
                            motion.value,
                          );
                          final sign =
                              Directionality.of(ctx) == TextDirection.rtl
                              ? -direction
                              : direction;
                          final offset = key == active && outgoing != null
                              ? (1 - progress) * sign
                              : key == outgoing
                              ? -progress * sign
                              : 0.0;
                          return FractionalTranslation(
                            translation: Offset(offset, 0),
                            child: child,
                          );
                        },
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget pageBody(String key) => switch (key) {
    'account' => widget.account,
    'sections' => SectionDirectory(
      profile: widget.profile,
      arabic: widget.arabic,
      open: open,
    ),
    'requests' => RequestsList(
      key: ValueKey('$project:${widget.arabic}'),
      api: widget.api,
      project: project,
      active: active == 'requests',
      arabic: widget.arabic,
      open: (id) => openRequestDetail(context, widget.api, id),
    ),
    'home' => home(),
    _ => SectionPage(
      key: ValueKey('$key:${widget.arabic}'),
      api: widget.api,
      section: key,
      profile: widget.profile,
      back: () => select('sections'),
    ),
  };

  Widget home() {
    final palette = Theme.of(context).colorScheme;
    final blue = palette.brightness == Brightness.dark
        ? const Color(0xff92baff)
        : const Color(0xff0759ea);
    final fill = blue.withValues(alpha: .07);
    final names = widget.arabic ? sectionArabic : sectionEnglish;
    final stats = dashboard?['stats'] as Map?;
    final latest = dashboard?['latest'] as List?;
    Widget heading(String label) => Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 10),
      child: Text(label, style: Theme.of(context).textTheme.titleMedium),
    );
    Widget shortcut(IconData icon, String label, VoidCallback action) =>
        TextButton.icon(
          style: TextButton.styleFrom(
            backgroundColor: palette.onSurface.withValues(alpha: .055),
            foregroundColor: palette.onSurface,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
          onPressed: action,
          icon: Icon(icon, color: blue, size: 20),
          label: Text(label),
        );
    return RefreshIndicator(
      onRefresh: () => loadHome(force: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
        children: [
          if (hasStats) ...[
            heading(t('إحصائيات الطلبات', 'Request statistics')),
            LayoutBuilder(
              builder: (ctx, box) {
                final cols = box.maxWidth >= 560 ? 4 : 2;
                final size = (box.maxWidth - (cols - 1) * 10) / cols;
                return Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final (key, label, icon) in [
                      ('open', t('مفتوحة', 'Open'), Icons.folder_open_outlined),
                      (
                        'waiting',
                        t('بانتظار إجراء', 'Waiting'),
                        Icons.hourglass_top_rounded,
                      ),
                      (
                        'overdue',
                        t('متأخرة', 'Overdue'),
                        Icons.event_busy_outlined,
                      ),
                      ('complete', t('مكتملة', 'Complete'), Icons.task_alt),
                    ])
                      Container(
                        width: size,
                        height: size,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: fill,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(icon, color: blue),
                            const Spacer(),
                            Text(
                              stats?[key]?.toString() ?? '—',
                              style: Theme.of(ctx).textTheme.headlineMedium,
                            ),
                            Text(
                              label,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
            if (issue.isNotEmpty)
              TextButton(
                onPressed: refreshHome,
                child: Text(t('إعادة المحاولة', 'Retry')),
              ),
          ],
          heading(t('اختصارات سريعة', 'Quick shortcuts')),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (canCreate)
                shortcut(
                  Icons.add_circle_outline,
                  t('طلب جديد', 'New request'),
                  createRequest,
                ),
              for (final key in allowedSections(widget.profile))
                shortcut(sectionIcons[key]!, names[key]!, () => open(key)),
            ],
          ),
          if (widget.queue != null)
            FutureBuilder<List<Map<String, Object?>>>(
              future: widget.queue!.items(),
              builder: (ctx, state) => Column(
                children: [
                  for (final row in state.data ?? <Map<String, Object?>>[])
                    ListTile(
                      leading: const Icon(Icons.sync),
                      title: Text(
                        row['issue']?.toString() ??
                            t('بانتظار الإرسال', 'Waiting to send'),
                      ),
                      trailing: row['issue'] == null
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close),
                              onPressed: () async {
                                await widget.queue!.discard(
                                  row['id'] as String,
                                );
                                queueChanged();
                              },
                            ),
                    ),
                ],
              ),
            ),
          if (latest != null) ...[
            heading(t('أحدث الطلبات', 'Recent requests')),
            for (final item in latest)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(item['number']),
                subtitle: Text(item['project_name']),
                onTap: () => openRequestDetail(context, widget.api, item['id']),
              ),
            if (latest.isEmpty) Text(t('لا توجد طلبات', 'No requests')),
          ],
        ],
      ),
    );
  }
}
