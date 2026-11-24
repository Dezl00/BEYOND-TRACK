import 'document_tools.dart';
import 'resource_editor.dart';
import 'request_operation.dart';
import 'track_header.dart';
import 'package:flutter/material.dart';
import 'api.dart';
import 'section_labels.dart';

const sectionIcons = <String, IconData>{
  'projects': Icons.domain_outlined,
  'boq': Icons.inventory_2_outlined,
  'materials': Icons.category_outlined,
  'units': Icons.straighten,
  'requests': Icons.receipt_long_outlined,
  'construction': Icons.engineering_outlined,
  'technical': Icons.architecture,
  'project_management': Icons.assignment_outlined,
  'procurement': Icons.shopping_cart_outlined,
  'finance': Icons.price_check,
  'accounts': Icons.account_balance_outlined,
  'receipts': Icons.local_shipping_outlined,
  'reports': Icons.bar_chart,
  'suppliers': Icons.storefront_outlined,
  'users': Icons.people_outline,
  'roles': Icons.admin_panel_settings_outlined,
  'audit': Icons.history,
  'notifications': Icons.notifications_outlined,
  'settings': Icons.settings_outlined,
};
const _queues = {
  'requests',
  'construction',
  'technical',
  'project_management',
  'procurement',
  'finance',
  'accounts',
  'receipts',
};

List<String> allowedSections(Map profile) {
  final allowed = (profile['navigation'] as List)
      .map((item) => item['key'])
      .whereType<String>()
      .toSet();
  return [
    for (final key in allowed)
      if (sectionIcons.containsKey(key)) key,
    if (allowed.contains('boq')) 'materials',
    if (allowed.contains('boq') && profile['canManageUnits'] == true) 'units',
  ];
}

String sectionPath(
  String section,
  String project, {
  String query = '',
  String? cursor,
}) {
  final params = {
    if (project.isNotEmpty) 'project': project,
    if (query.isNotEmpty) 'q': query,
    if (cursor != null) 'cursor': cursor,
  };
  return Uri(
    path: '/api/v1/pages/$section',
    queryParameters: params.isEmpty ? null : params,
  ).toString();
}

class SectionDirectory extends StatelessWidget {
  const SectionDirectory({
    super.key,
    required this.profile,
    required this.arabic,
    required this.open,
  });
  final Map<String, dynamic> profile;
  final bool arabic;
  final ValueChanged<String> open;
  @override
  Widget build(BuildContext context) {
    final names = arabic ? sectionArabic : sectionEnglish;
    final sections = allowedSections(profile);
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      itemCount: sections.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (_, i) {
        final key = sections[i];
        return ListTile(
          leading: Icon(sectionIcons[key]),
          title: Text(names[key]!),
          trailing: const Icon(Icons.arrow_forward_ios, size: 16),
          onTap: () => open(key),
        );
      },
    );
  }
}

class SectionPage extends StatefulWidget {
  const SectionPage({
    super.key,
    required this.api,
    required this.section,
    this.profile = const {},
    this.back,
  });
  final TrackApi api;
  final String section;
  final Map profile;
  final VoidCallback? back;

  @override
  State<SectionPage> createState() => _SectionPageState();
}

class _SectionPageState extends State<SectionPage> {
  final rows = <Map>[];
  Map summary = const {};
  String projectName = '';
  String query = '', error = '';
  String? next;
  bool busy = false;
  int generation = 0;
  String t(String ar, String en) => widget.api.locale == 'ar' ? ar : en;
  String get selectedProject => widget.api.project.value.id;
  String get keyName => widget.section;
  String get title =>
      (widget.api.locale == 'ar' ? sectionArabic : sectionEnglish)[keyName]!;
  bool get report => keyName == 'reports' && selectedProject.isNotEmpty;
  @override
  void initState() {
    super.initState();
    widget.api.project.addListener(changed);
    load();
  }

  void changed() {
    load();
  }

  @override
  void dispose() {
    widget.api.project.removeListener(changed);
    super.dispose();
  }

  String? displayedPath;
  Future<void> load({bool more = false, bool force = false}) async {
    if (more && (busy || next == null)) return;
    final version = ++generation;
    final base = sectionPath(keyName, selectedProject, query: query);
    final path = more
        ? sectionPath(keyName, selectedProject, query: query, cursor: next)
        : base;
    void apply(Map<String, dynamic> page) {
      if (!mounted || generation != version) return;
      final data = report ? page['data'] as Map : page;
      setState(() {
        if (!more) rows.clear();
        if (report) {
          summary = page['overview'];
          projectName = page['context']['name'];
        }
        rows.addAll((data['items'] as List).cast<Map>());
        next = data['next'];
      });
    }

    setState(() {
      busy = true;
      error = '';
      if (displayedPath != base) {
        rows.clear();
        next = null;
        summary = {};
        projectName = '';
        displayedPath = base;
      }
    });
    try {
      apply(
        await widget.api.page(path, force: force, preview: more ? null : apply),
      );
    } catch (e) {
      if (mounted && version == generation)
        setState(() {
          if (e is ApiFailure && [401, 403, 404].contains(e.status)) {
            rows.clear();
            summary = {};
            next = null;
            projectName = '';
          }
          error = e.toString();
        });
    } finally {
      if (mounted && version == generation) setState(() => busy = false);
    }
  }

  Future<void> select(Map row) async {
    if (keyName == 'reports' && !report) {
      widget.api.project.value = (
        id: row['id'] as String,
        name: row['name'] as String,
      );
    } else if (_queues.contains(keyName) || keyName == 'notifications') {
      if (keyName == 'notifications' && row['read_at'] == null) {
        try {
          await widget.api.call('/api/commands', {
            'command': 'notification-read',
            'data': {'id': row['id']},
          });
        } catch (e) {
          if (mounted)
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text(e.toString())));
        }
      }
      if (!mounted) return;
      await openRequestDetail(
        context,
        widget.api,
        row[keyName == 'notifications' ? 'request_id' : 'id'],
      );
      if (mounted) await load();
    } else {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (ctx) => Scaffold(
            appBar: TrackHeader(
              api: widget.api,
              title: rowTitle(row),
              afterChange: () => Navigator.pop(ctx),
            ),
            body: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
              children: [
                ...fields(row),
                if (canWrite(true) &&
                    row['is_owner'] != true &&
                    row['owner_role'] != true)
                  FilledButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      editResource(row);
                    },
                    child: Text(t('تعديل', 'Edit')),
                  ),
              ],
            ),
          ),
        ),
      );
    }
  }

  bool get canExport {
    final module = {'materials': 'boq', 'units': 'boq'}[keyName] ?? keyName;
    return (widget.profile['permissions'] as List? ?? []).contains(
          '$module.export',
        ) &&
        (keyName != 'reports' || report);
  }

  Future<void> importCatalog() async {
    if (selectedProject.isEmpty) await chooseProject(context, widget.api);
    if (!mounted || selectedProject.isEmpty) return;
    final saved = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => ImportBoq(api: widget.api)));
    if (saved == true && mounted) await load();
  }

  Future<void> printReport() async {
    final selected = selectedProject, name = projectName;
    final data = [...rows];
    var cursor = next;
    try {
      while (cursor != null) {
        final res = await widget.api.call(
          Uri(
            path: '/api/v1/pages/reports',
            queryParameters: {'project': selected, 'cursor': cursor},
          ).toString(),
        );
        if (!mounted || selectedProject != selected) return;
        data.addAll((res['data']['items'] as List).cast<Map>());
        cursor = res['data']['next'];
      }
      if (!mounted) return;
      await printDocument(context, widget.api, title, [
        name,
        t(
          'المادة · الوحدة · المخصص · المطلوب · المستلم',
          'Material · Unit · Allocated · Requested · Received',
        ),
        for (final r in data)
          [
            r['name'],
            r['unit_name'],
            r['allocated'],
            r['requested'],
            r['received'],
          ].where((v) => v != null).join(' · '),
      ]);
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  bool canWrite(bool edit) {
    if (!resourceCommands.containsKey(keyName)) return false;
    final module = {'materials': 'boq', 'units': 'boq'}[keyName] ?? keyName;
    if (keyName == 'units' && widget.profile['canManageUnits'] != true)
      return false;
    return (widget.profile['permissions'] as List? ?? []).contains(
      '$module.${edit || keyName == 'units' ? 'edit' : 'create'}',
    );
  }

  Future<void> editResource([Map? row]) async {
    if (keyName == 'boq' && row == null && selectedProject.isEmpty) {
      await chooseProject(context, widget.api);
      if (!mounted || selectedProject.isEmpty) return;
    }
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ResourceEditor(
          api: widget.api,
          section: keyName,
          profile: widget.profile,
          row: row,
        ),
      ),
    );
    if (mounted && saved == true) await load();
  }

  String rowTitle(Map r) {
    if (keyName == 'audit')
      return indexedLabel(
        widget.api.locale == 'ar' ? auditArabic : auditEnglish,
        r['action'],
        title,
      );
    if (keyName == 'notifications')
      return indexedLabel(
        widget.api.locale == 'ar' ? notificationsArabic : notificationsEnglish,
        r['type'],
        title,
      );
    return (r['number'] ?? r['name'] ?? r['code'] ?? title).toString();
  }

  Iterable<Widget> fields(Map row) sync* {
    for (final entry in {
      'code': t('الرمز', 'Code'),
      'project_name': t('المشروع', 'Project'),
      'location': t('الموقع', 'Location'),
      'description': t('الوصف', 'Description'),
      'unit_name': t('الوحدة', 'Unit'),
      'symbol': t('الرمز', 'Symbol'),
      'quantity': t('الكمية', 'Quantity'),
      'boq_name': t('البند', 'BOQ item'),
      'email': t('البريد', 'Email'),
      'job_title': t('المسمى الوظيفي', 'Job title'),
      'role_name': t('الدور', 'Role'),
      'user_name': t('الموظف', 'Employee'),
      'created_at': t('التاريخ', 'Date'),
      'allocated': t('المخصص', 'Allocated'),
      'requested': t('المطلوب', 'Requested'),
      'received': t('المستلم', 'Received'),
      'active': t('مفعّل', 'Active'),
      'archived': t('مؤرشف', 'Archived'),
    }.entries) {
      final value = row[entry.key];
      if (value == null || value == '') continue;
      yield ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(entry.value),
        subtitle: Text(
          value is bool
              ? (value ? t('نعم', 'Yes') : t('لا', 'No'))
              : value.toString(),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: TrackHeader(api: widget.api, title: title, back: widget.back),
    floatingActionButton: canWrite(false)
        ? FloatingActionButton(
            onPressed: () => editResource(),
            tooltip: t('إضافة', 'Add'),
            child: const Icon(Icons.add),
          )
        : null,
    body: RefreshIndicator(
      onRefresh: () => load(force: true),
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        itemCount: rows.length + 2,
        itemBuilder: (_, i) {
          if (i == 0)
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: 8,
                  children: [
                    if (keyName == 'boq' && canWrite(false))
                      TextButton.icon(
                        onPressed: importCatalog,
                        icon: const Icon(Icons.upload_file),
                        label: Text(t('استيراد', 'Import')),
                      ),
                    if (canExport)
                      TextButton.icon(
                        icon: const Icon(Icons.download),
                        label: Text(t('تصدير CSV', 'Export CSV')),
                        onPressed: () => saveDownload(
                          context,
                          widget.api,
                          Uri(
                            path: report
                                ? '/api/reports/export'
                                : '/api/export',
                            queryParameters: {
                              if (!report) 'resource': keyName,
                              if (selectedProject.isNotEmpty)
                                'project': selectedProject,
                              if (query.isNotEmpty) 'q': query,
                            },
                          ),
                          'beyond-$keyName.csv',
                          'text/csv',
                        ),
                      ),
                    if (report && canExport && !busy && error.isEmpty)
                      TextButton.icon(
                        onPressed: printReport,
                        icon: const Icon(Icons.print),
                        label: Text(t('طباعة', 'Print')),
                      ),
                  ],
                ),
                report
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            projectName,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          if (summary.isNotEmpty)
                            Wrap(
                              spacing: 8,
                              children: [
                                for (final (label, key) in [
                                  (t('الطلبات', 'Requests'), 'request_count'),
                                  (t('الاستلام', 'Receipts'), 'receipt_count'),
                                  (t('المواد', 'Materials'), 'materials'),
                                ])
                                  Chip(label: Text('$label  ${summary[key]}')),
                              ],
                            ),
                        ],
                      )
                    : TextField(
                        textInputAction: TextInputAction.search,
                        onSubmitted: (text) {
                          query = text.trim();
                          load();
                        },
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.search),
                          labelText: t('بحث', 'Search'),
                        ),
                      ),
              ],
            );
          if (i == rows.length + 1) {
            if (busy) return const SizedBox.shrink();
            if (error.isNotEmpty)
              return Column(
                children: [
                  Text(error),
                  TextButton(
                    onPressed: () => load(more: rows.isNotEmpty),
                    child: Text(t('إعادة المحاولة', 'Retry')),
                  ),
                ],
              );
            if (next != null)
              return TextButton(
                onPressed: () => load(more: true),
                child: Text(t('عرض المزيد', 'Load more')),
              );
            if (rows.isEmpty)
              return Padding(
                padding: const EdgeInsets.all(24),
                child: Center(child: Text(t('لا توجد نتائج', 'No results'))),
              );
            return const SizedBox.shrink();
          }
          final row = rows[i - 1];
          final subtitle = [
            row['project_name'],
            row['number'] == null ? row['code'] : null,
            row['role_name'],
            row['unit_name'],
            if (keyName == 'audit') row['user_name'],
            if (keyName == 'notifications') row['number'],
            if (row['status'] is int)
              indexedLabel(
                widget.api.locale == 'ar' ? statusesArabic : statusesEnglish,
                row['status'],
                '',
              ),
            if (report)
              t('المطلوب', 'Requested') + ' ' + row['requested'].toString(),
          ].where((v) => v != null && v != '').join(' · ');
          return ListTile(
            leading: Icon(sectionIcons[keyName]),
            title: Text(rowTitle(row)),
            subtitle: subtitle.isEmpty ? null : Text(subtitle),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: () => select(row),
          );
        },
      ),
    ),
  );
}

String indexedLabel(List<String> values, dynamic index, String fallback) =>
    index is int && index >= 0 && index < values.length
    ? values[index]
    : fallback;

Future<void> openRequestDetail(
  BuildContext context,
  TrackApi api,
  String id,
) async {
  if (!await prepareNavigation(context, api, ['/api/requests/$id']) ||
      !context.mounted)
    return;
  await Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => RequestDetail(api: api, id: id),
    ),
  );
}

class RequestDetail extends StatefulWidget {
  const RequestDetail({
    super.key,
    required this.api,
    required this.id,

    this.close,
  });
  final TrackApi api;
  final String id;

  final VoidCallback? close;
  @override
  State<RequestDetail> createState() => _RequestDetailState();
}

class _RequestDetailState extends State<RequestDetail> {
  late Future<Map<String, dynamic>> record = fetch();
  bool submitting = false;
  String t(String a, String e) => widget.api.locale == 'ar' ? a : e;
  String status(dynamic index) => indexedLabel(
    widget.api.locale == 'ar' ? statusesArabic : statusesEnglish,
    index,
    '',
  );
  String get path => '/requests/${widget.id}';
  Future<Map<String, dynamic>> fetch({bool force = false}) =>
      widget.api.page('/api$path', force: force);
  void refresh() => setState(() {
    record = fetch(force: true);
  });
  Future<void> transition(
    Map request,
    String label,
    int target,
    bool needsReason,
  ) async {
    if (submitting) return;
    var reason = '';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, update) => AlertDialog(
          title: Text(label),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${request['number']} · ${status(target)}'),
              if (needsReason)
                TextField(
                  maxLength: 1000,
                  decoration: InputDecoration(labelText: t('السبب', 'Reason')),
                  onChanged: (v) => update(() => reason = v.trim()),
                ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(t('رجوع', 'Back')),
            ),
            FilledButton(
              onPressed: needsReason && reason.isEmpty
                  ? null
                  : () => Navigator.pop(ctx, true),
              child: Text(t('تأكيد', 'Confirm')),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !mounted || submitting) return;
    setState(() => submitting = true);
    try {
      await widget.api.call('/api/commands', {
        'command': 'transition',
        'data': {
          'id': widget.id,
          'version': request['version'],
          'status': target,
          'reason': reason,
        },
      });
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted)
        setState(() {
          submitting = false;
          record = fetch();
        });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: TrackHeader(
      api: widget.api,
      title: t('تفاصيل الطلب', 'Request details'),
      back: widget.close,
      afterChange: widget.close ?? () => Navigator.maybePop(context),
    ),
    body: FutureBuilder<Map<String, dynamic>>(
      future: record,
      initialData: widget.api.snapshot('/api$path'),
      builder: (ctx, s) {
        if (s.hasError)
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(s.error.toString()),
                TextButton(
                  onPressed: refresh,
                  child: Text(t('إعادة المحاولة', 'Retry')),
                ),
              ],
            ),
          );
        if (!s.hasData) return const SizedBox.shrink();
        final r = s.requireData, actions = r['actions'] as Map;
        final approved = {12: 1, 13: 1, 15: 2, 5: 16}[r['status']];
        return RefreshIndicator(
          onRefresh: () async {
            refresh();
            await record;
          },
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                r['number'].toString(),
                style: Theme.of(ctx).textTheme.headlineSmall,
              ),
              Text(
                [
                  r['project_name'],
                  r['created_by_name'],
                ].whereType<String>().join(' · '),
              ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Chip(label: Text(status(r['status']))),
              ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  icon: const Icon(Icons.print),
                  label: Text(t('طباعة الطلب', 'Print request')),
                  onPressed: () => printDocument(
                    context,
                    widget.api,
                    r['number'].toString(),
                    [
                      r['project_name'] ?? '',
                      status(r['status']),
                      r['notes'] ?? '',
                      for (final l in r['lines'])
                        [
                          l['material_name'],
                          l['quantity'],
                          l['unit_name'],
                          l['notes'],
                        ].where((v) => v != null && v != '').join(' · '),
                      for (final h in r['history']['items'])
                        [
                          status(h['to_status']),
                          h['user_name'],
                          h['note'],
                        ].where((v) => v != null && v != '').join(' · '),
                    ],
                  ),
                ),
              ),
              if ((r['notes'] ?? '') != '') Text(r['notes']),
              const Divider(),
              for (final line in r['lines'] as List)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(line['material_name']),
                  subtitle: Text(line['boq_name'] ?? ''),
                  trailing: Text(
                    "${line['quantity']} ${line['unit_name'] ?? ''}",
                  ),
                ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final (key, label, target, reason) in [
                    ('submit', t('إرسال', 'Submit'), 12, false),
                    ('approve', t('اعتماد', 'Approve'), approved, false),
                    (
                      'approvePricing',
                      t('اعتماد التسعير', 'Approve pricing'),
                      11,
                      false,
                    ),
                    (
                      'returnPricing',
                      t('إرجاع للمشتريات', 'Return to procurement'),
                      2,
                      true,
                    ),
                    ('reject', t('رفض', 'Reject'), 7, true),
                    ('hold', t('تعليق', 'Hold'), 13, true),
                    ('cancel', t('إلغاء الطلب', 'Cancel request'), 8, true),
                    ('restore', t('استعادة', 'Restore'), 0, false),
                  ])
                    if (actions[key] == true && target != null)
                      OutlinedButton(
                        onPressed: submitting
                            ? null
                            : () => transition(r, label, target, reason),
                        child: Text(label),
                      ),
                ],
              ),
              for (final e in {
                'technicalReview': t('مراجعة المواد', 'Technical review'),
                'quotations': t('تسجيل عرض السعر', 'Quotation'),
                'payment': t('تسجيل الدفع', 'Record payment'),
                'invoice': t('إرفاق الفاتورة', 'Attach invoice'),
                'receive': t('استلام المواد', 'Receive materials'),
                'overage': t('اعتماد التجاوز', 'Approve overage'),
                'edit': t('تعديل الطلب', 'Edit request'),
              }.entries)
                if (actions[e.key] == true)
                  OutlinedButton(
                    onPressed: submitting
                        ? null
                        : () async {
                            final originalProject = widget.api.project.value.id;
                            final saved = await Navigator.of(context)
                                .push<bool>(
                                  MaterialPageRoute(
                                    builder: (_) => RequestOperation(
                                      api: widget.api,
                                      request: r,
                                      action: e.key,
                                      title: e.value,
                                    ),
                                  ),
                                );
                            if (!mounted) return;
                            if (originalProject !=
                                widget.api.project.value.id) {
                              (widget.close ??
                                  () => Navigator.maybePop(context))();
                            } else if (saved == true) {
                              refresh();
                            }
                          },
                    child: Text(e.value),
                  ),
              for (final f in r['files'] ?? [])
                ListTile(
                  leading: const Icon(Icons.attach_file),
                  title: Text(f['name']),
                  onTap: () async {
                    try {
                      await widget.api.openAttachment(f['id']);
                    } catch (e) {
                      if (context.mounted)
                        ScaffoldMessenger.of(
                          context,
                        ).showSnackBar(SnackBar(content: Text(e.toString())));
                    }
                  },
                ),
              for (final receipt in r['receipts'] ?? [])
                ListTile(
                  leading: const Icon(Icons.local_shipping_outlined),
                  title: Text(receipt['received_by'] ?? ''),
                  subtitle: Text(receipt['notes'] ?? ''),
                ),
              ExpansionTile(
                title: Text(t('سجل الطلب', 'Request history')),
                children: [
                  for (final event in r['history']['items'])
                    ListTile(
                      title: Text(status(event['to_status'])),
                      subtitle: Text(
                        [
                          event['user_name'],
                          event['note'],
                        ].whereType<String>().join(' · '),
                      ),
                    ),
                ],
              ),
            ],
          ),
        );
      },
    ),
  );
}
