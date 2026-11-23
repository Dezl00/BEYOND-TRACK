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
    required this.openAccount,
  });
  final SubmissionQueue? queue;
  final bool canCreate;
  final TrackApi api;
  final String name;
  final bool arabic;
  final VoidCallback openAccount;
  final ValueChanged<String> openRequest;
  @override
  State<Overview> createState() => _OverviewState();
}

class _OverviewState extends State<Overview> {
  @override
  void initState() {
    super.initState();
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
    super.dispose();
  }

  bool requests = false;
  String project = '', projectName = '';
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
  Future<void> choose() async {
    try {
      final items =
          (await widget.api.call('/api/options?resource=projects'))['items']
              as List;
      if (!mounted) return;
      final result = await showModalBottomSheet<Map>(
        context: context,
        builder: (ctx) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final item in [
                {'id': '', 'name': t('كل المشاريع', 'All projects')},
                ...items,
              ])
                ListTile(
                  title: Text(item['name']),
                  onTap: () => Navigator.pop(ctx, item),
                ),
            ],
          ),
        ),
      );
      if (result != null && mounted)
        setState(() {
          project = result['id'];
          projectName = result['name'];
          data = load();
        });
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      actions: [
        IconButton(
          tooltip: t('الإشعارات', 'Notifications'),
          icon: const Icon(Icons.notifications_outlined),
          onPressed: () async {
            final data = widget.api.call('/api/v1/pages/notifications');
            await showModalBottomSheet<void>(
              context: context,
              showDragHandle: true,
              builder: (ctx) => SafeArea(
                child: FutureBuilder<Map<String, dynamic>>(
                  key: ValueKey(project),
                  future: data,
                  builder: (ctx, s) {
                    if (s.hasError)
                      return Center(child: Text(s.error.toString()));
                    if (!s.hasData)
                      return const Center(child: CircularProgressIndicator());
                    final items = s.requireData['items'] as List;
                    final names = [
                      t('طلب جديد', 'New request'),
                      t('تغيير حالة', 'Status update'),
                      t('تأكيد استلام', 'Receipt confirmed'),
                    ];
                    return ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Text(
                          t('الإشعارات', 'Notifications'),
                          style: Theme.of(ctx).textTheme.titleMedium,
                        ),
                        if (items.isEmpty)
                          Text(t('لا توجد إشعارات', 'No notifications')),
                        for (final item in items)
                          ListTile(
                            title: Text(names[item['type']]),
                            onTap: () {
                              Navigator.pop(ctx);
                              widget.openRequest(item['request_id']);
                            },
                            subtitle: Text(item['number']),
                            leading: Icon(
                              item['read_at'] == null
                                  ? Icons.mark_email_unread_outlined
                                  : Icons.mail_outline,
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
            );
          },
        ),
      ],
      toolbarHeight: 72,
      backgroundColor: const Color(0xff0759ea),
      foregroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      leading: requests
          ? null
          : IconButton(
              onPressed: widget.openAccount,
              icon: const Icon(Icons.account_circle, size: 32),
            ),
      title: requests
          ? Text(t('الطلبات', 'Requests'))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.name, style: const TextStyle(fontSize: 16)),
                InkWell(
                  onTap: choose,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          projectName.isEmpty
                              ? t('كل المشاريع', 'All projects')
                              : projectName,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                      const Icon(Icons.expand_more),
                    ],
                  ),
                ),
              ],
            ),
    ),
    floatingActionButton: widget.canCreate && widget.queue != null
        ? FloatingActionButton.extended(
            onPressed: () async {
              if (project.isEmpty) await choose();
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
            selectedIndex: requests ? 1 : 0,
            onDestinationSelected: (i) {
              if (i == 2) {
                widget.openAccount();
                return;
              }
              setState(() => requests = i == 1);
            },
            destinations: [
              NavigationDestination(
                icon: const Icon(Icons.home_outlined),
                label: t('الرئيسية', 'Home'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.receipt_long_outlined),
                label: t('الطلبات', 'Requests'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.more_horiz),
                label: t('الحساب', 'Account'),
              ),
            ],
          ),
        ),
      ),
    ),
    body: requests
        ? RequestsList(
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
