import 'package:flutter/material.dart';
import 'api.dart';

class RequestsList extends StatefulWidget {
  const RequestsList({
    super.key,
    required this.api,
    required this.project,
    required this.arabic,
    required this.open,
  });
  final TrackApi api;
  final String project;
  final bool arabic;
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
    load(reset: true);
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> load({bool reset = false}) async {
    if (busy && !reset) return;
    final version = ++generation;
    setState(() {
      busy = true;
      error = '';
      if (reset) {
        rows.clear();
        next = null;
      }
    });
    try {
      final uri = Uri(
        path: '/api/v1/pages/requests',
        queryParameters: {
          if (widget.project.isNotEmpty) 'project': widget.project,
          if (query.isNotEmpty) 'q': query,
          if (next != null) 'cursor': next,
        },
      );
      final data = await widget.api.call(uri.toString());
      if (!mounted || version != generation) return;
      setState(() {
        rows.addAll((data['items'] as List).cast<Map>());
        next = data['next'];
      });
    } catch (e) {
      if (mounted && version == generation)
        setState(() => error = e.toString());
    } finally {
      if (mounted && version == generation) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () => load(reset: true),
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 96),
      children: [
        TextField(
          controller: search,
          textInputAction: TextInputAction.search,
          onSubmitted: (q) {
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
        if (busy) const Center(child: CircularProgressIndicator()),
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
