import 'package:flutter/material.dart';
import 'api.dart';
import 'sections.dart' show sectionPath;

class RequestsList extends StatefulWidget {
  const RequestsList({
    super.key,
    required this.api,
    required this.project,
    required this.arabic,
    required this.open,
    required this.active,
  });
  final TrackApi api;
  final String project;
  final bool arabic, active;
  final ValueChanged<String> open;
  @override
  State<RequestsList> createState() => _RequestsListState();
}

class _RequestsListState extends State<RequestsList> {
  final search = TextEditingController();
  final rows = <Map>[];
  String query = '', error = '';
  String? next;
  bool busy = false;
  int generation = 0;
  String t(String ar, String en) => widget.arabic ? ar : en;
  @override
  void initState() {
    super.initState();
    widget.api.changes.addListener(changed);
    load(reset: true);
  }

  void changed() => load(reset: true);
  @override
  void didUpdateWidget(RequestsList old) {
    super.didUpdateWidget(old);
    if (!old.active && widget.active && (rows.isEmpty || next == null))
      load(reset: true);
  }

  @override
  void dispose() {
    widget.api.changes.removeListener(changed);
    search.dispose();
    super.dispose();
  }

  Future<void> load({bool reset = false, bool force = false}) async {
    if (busy && !reset) return;
    final version = ++generation;
    final path = sectionPath(
      'requests',
      widget.project,
      query: query,
      cursor: reset ? null : next,
    );
    setState(() {
      busy = true;
      error = '';
    });
    void apply(Map<String, dynamic> data) {
      if (!mounted || version != generation) return;
      setState(() {
        if (reset) rows.clear();
        rows.addAll((data['items'] as List).cast<Map>());
        next = data['next'];
      });
    }

    try {
      apply(
        await widget.api.page(
          path,
          force: force,
          preview: reset ? apply : null,
        ),
      );
    } catch (e) {
      if (mounted && version == generation)
        setState(() {
          if (e is ApiFailure && [401, 403, 404].contains(e.status)) {
            rows.clear();
            next = null;
          }
          error = e.toString();
        });
    } finally {
      if (mounted && version == generation) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () => load(reset: true, force: true),
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 96),
      children: [
        TextField(
          controller: search,
          textInputAction: TextInputAction.search,
          onSubmitted: (q) {
            if (query != q.trim()) {
              rows.clear();
              next = null;
            }
            query = q.trim();
            load(reset: true);
          },
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            labelText: t('بحث في الطلبات', 'Search requests'),
          ),
        ),
        const SizedBox(height: 16),
        for (final item in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              tileColor: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: .05),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              title: Text(item['number']),
              subtitle: Text(item['project_name']),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => widget.open(item['id']),
            ),
          ),
        if (!busy && error.isNotEmpty)
          TextButton(
            onPressed: () => load(reset: rows.isEmpty),
            child: Text(
              t('تعذر التحميل — إعادة المحاولة', 'Could not load — retry'),
            ),
          ),
        if (!busy && rows.isEmpty && error.isEmpty)
          Text(t('لا توجد طلبات', 'No requests')),
        if (!busy && next != null)
          TextButton(
            onPressed: load,
            child: Text(t('عرض المزيد', 'Load more')),
          ),
      ],
    ),
  );
}
