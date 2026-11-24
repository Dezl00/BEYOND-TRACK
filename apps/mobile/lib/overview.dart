import 'track_header.dart';
import 'requests_list.dart';
import 'submissions.dart';
import 'request_form.dart';
import 'package:flutter/material.dart';
import 'api.dart';

class Overview extends StatefulWidget {
  const Overview({
    super.key,
    required this.api,
    required this.name,
    required this.arabic,
    required this.queue,
    required this.canCreate,
    required this.openRequest,
    required this.account,
    required this.directory,
    required this.hasDashboard,
  });
  final SubmissionQueue? queue;
  final bool canCreate, hasDashboard;
  final TrackApi api;
  final String name;
  final bool arabic;
  final Widget account;
  final Widget Function(VoidCallback openAccount) directory;
  final ValueChanged<String> openRequest;
  @override
  State<Overview> createState() => _OverviewState();
}

class _OverviewState extends State<Overview> {
  @override
  void initState() {
    super.initState();
    tab = widget.hasDashboard ? 0 : 2;
    widget.api.project.addListener(projectChanged);
    widget.queue?.addListener(_queueChanged);
  }

  void _queueChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(covariant Overview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.queue != oldWidget.queue) {
      oldWidget.queue?.removeListener(_queueChanged);
      widget.queue?.addListener(_queueChanged);
    }
  }

  @override
  void dispose() {
    widget.queue?.removeListener(_queueChanged);
    widget.api.project.removeListener(projectChanged);
    super.dispose();
  }

  int tab = 0;
  bool get requests => tab == 1;
  String get project => widget.api.project.value.id;
  void projectChanged() {
    if (!widget.hasDashboard) return;
    setState(() => data = load());
  }

  late Future<Map<String, dynamic>> data = load();
  Map<String, dynamic>? preview;
  Future<Map<String, dynamic>> load() async {
    final selected = project;
    final path =
        '/api/v1/pages/dashboard${selected.isEmpty ? '' : '?project=$selected'}';
    preview = null;
    final snapshot = await widget.api.cached(path);
    if (snapshot != null && mounted && selected == project)
      setState(() => preview = snapshot);
    return widget.api.call(path);
  }

  String t(String ar, String en) => widget.arabic ? ar : en;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: TrackHeader(
      api: widget.api,
      home: tab == 0,
      primary: true,
      title: [
        widget.name,
        t('الطلبات', 'Requests'),
        t('الأقسام', 'Sections'),
        t('الحساب', 'Account'),
      ][tab],
    ),
    floatingActionButton: tab < 2 && widget.canCreate && widget.queue != null
        ? FloatingActionButton.extended(
            onPressed: () async {
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
              if (!mounted) return;
              setState(() => data = load());
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    pending.isEmpty
                        ? t('تم الإرسال', 'Submitted')
                        : t('راجع قائمة الإرسال', 'Check submission queue'),
                  ),
                ),
              );
            },
            icon: const Icon(Icons.add),
            label: Text(t('طلب جديد', 'New request')),
          )
        : null,
    bottomNavigationBar: SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(13, 4, 13, 8),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(27),
          child: NavigationBar(
            height: 64,
            selectedIndex: widget.hasDashboard ? tab : tab - 2,
            onDestinationSelected: (i) =>
                setState(() => tab = widget.hasDashboard ? i : i + 2),
            destinations: [
              if (widget.hasDashboard)
                NavigationDestination(
                  icon: const Icon(Icons.home_outlined),
                  label: t('الرئيسية', 'Home'),
                ),
              if (widget.hasDashboard)
                NavigationDestination(
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: t('الطلبات', 'Requests'),
                ),
              NavigationDestination(
                icon: const Icon(Icons.more_horiz),
                label: t('الأقسام', 'Sections'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.person_outline),
                label: t('الحساب', 'Account'),
              ),
            ],
          ),
        ),
      ),
    ),
    body: tab == 3
        ? widget.account
        : tab == 2
        ? widget.directory(() => setState(() => tab = 3))
        : requests
        ? RequestsList(
            key: ValueKey(project),
            api: widget.api,
            project: project,
            arabic: widget.arabic,
            open: widget.openRequest,
          )
        : FutureBuilder<Map<String, dynamic>>(
            key: ValueKey(project),
            future: data,
            builder: (ctx, snap) {
              if (snap.hasError)
                return Center(
                  child: TextButton(
                    onPressed: () => setState(() => data = load()),
                    child: Text(t('إعادة المحاولة', 'Retry')),
                  ),
                );
              if (!snap.hasData && preview == null)
                return const Center(child: CircularProgressIndicator());
              final body = snap.data ?? preview!, stats = body['stats'] as Map;
              return RefreshIndicator(
                onRefresh: () async {
                  setState(() => data = load());
                  await data;
                },
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(20),
                  children: [
                    if (widget.queue != null)
                      FutureBuilder<List<Map<String, Object?>>>(
                        future: widget.queue!.items(),
                        builder: (ctx, state) => Column(
                          children: [
                            for (final row
                                in state.data ?? <Map<String, Object?>>[])
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
                                          if (mounted) setState(() {});
                                        },
                                      ),
                              ),
                          ],
                        ),
                      ),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final entry in {
                          'open': t('مفتوحة', 'Open'),
                          'waiting': t('بانتظار إجراء', 'Waiting'),
                          'overdue': t('متأخرة', 'Overdue'),
                          'complete': t('مكتملة', 'Complete'),
                        }.entries)
                          Chip(
                            label: Text(
                              '${entry.value}  ${stats[entry.key] ?? 0}',
                            ),
                            side: BorderSide.none,
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Text(
                      t('أحدث الطلبات', 'Recent requests'),
                      style: Theme.of(ctx).textTheme.titleMedium,
                    ),
                    for (final item in body['latest'])
                      ListTile(
                        onTap: () => widget.openRequest(item['id']),
                        title: Text(item['number']),
                        subtitle: Text(item['project_name']),
                      ),
                    if ((body['latest'] as List).isEmpty)
                      Text(t('لا توجد طلبات', 'No requests')),
                  ],
                ),
              );
            },
          ),
  );
}
