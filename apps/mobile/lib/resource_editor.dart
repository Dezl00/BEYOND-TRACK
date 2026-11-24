import 'package:flutter/material.dart';
import 'api.dart';
import 'track_header.dart';
import 'section_labels.dart';

const resourceCommands = {
  'projects': 'project',
  'boq': 'boq',
  'materials': 'material',
  'suppliers': 'supplier',
  'units': 'unit',
  'users': 'user',
  'roles': 'role',
};

class ResourceEditor extends StatefulWidget {
  const ResourceEditor({
    super.key,
    required this.api,
    required this.section,
    required this.profile,
    this.row,
  });
  final TrackApi api;
  final String section;
  final Map profile;
  final Map? row;
  @override
  State<ResourceEditor> createState() => _ResourceEditorState();
}

class _ResourceEditorState extends State<ResourceEditor> {
  final form = GlobalKey<FormState>();
  final values = <String, dynamic>{};
  String error = '';
  bool busy = false;
  String get section => widget.section;
  String t(String a, String b) => widget.api.locale == 'ar' ? a : b;
  @override
  void initState() {
    super.initState();
    final row = widget.row ?? {};
    for (final key in [
      'id',
      'name',
      'code',
      'location',
      'client',
      'details',
      'description',
      'symbol',
      'quantity',
      'email',
      'username',
      'permissions',
      'archived',
      'active',
      'locked',
    ])
      if (row[key] != null) values[key] = row[key];
    for (final e in {
      'unitId': 'unit_id',
      'boqItemId': 'boq_item_id',
      'parentId': 'parent_id',
      'jobTitle': 'job_title',
      'projectIds': 'project_ids',
      'roleId': 'role_id',
      'otpEnabled': 'otp_enabled',
      'otpExempt': 'otp_exempt',
      'forcePasswordChange': 'force_password_change',
      'whatsappNumber': 'whatsapp_number',
      'whatsappCountryCode': 'whatsapp_country_code',
      'whatsappEnabled': 'whatsapp_enabled',
      'startDate': 'start_date',
      'endDate': 'end_date',
    }.entries)
      if (row[e.value] != null) values[e.key] = row[e.value];
    if (section == 'roles')
      values['permissions'] = List<String>.from(row['permissions'] ?? []);
    if (section == 'users')
      values['projectIds'] = List<String>.from(row['project_ids'] ?? []);
    if (section == 'boq') {
      values['level'] = row['level'] ?? 1;
      values['parentId'] = row['parent_id'];
      values['projectId'] = row['project_id'] ?? widget.api.project.value.id;
    }
  }

  Widget field(
    String key,
    String label, {
    bool required = true,
    bool secret = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextFormField(
      key: ValueKey(key),
      initialValue: values[key]?.toString() ?? '',
      obscureText: secret,
      decoration: InputDecoration(labelText: label),
      validator: (v) =>
          required && (v ?? '').trim().isEmpty ? t('مطلوب', 'Required') : null,
      onChanged: (v) {
        if (v.isEmpty && !required && key == 'password') {
          values.remove(key);
        } else {
          values[key] = v;
        }
      },
    ),
  );
  Future<void> lookup(
    String key,
    String resource,
    String label, {
    int? level,
    bool multi = false,
  }) async {
    final source = await showModalBottomSheet<Map>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => ResourceLookup(
        api: widget.api,
        resource: resource,
        level: level,
        project: values['projectId'] ?? widget.api.project.value.id,
        title: label,
      ),
    );
    if (source == null || !mounted) return;
    setState(() {
      if (multi) {
        final ids = values[key] as List;
        ids.contains(source['id'])
            ? ids.remove(source['id'])
            : ids.add(source['id']);
      } else {
        values[key] = source['id'];
      }
      names[source['id']] = source['name'];
    });
  }

  final names = <String, String>{};
  Widget selector(
    String key,
    String resource,
    String label, {
    int? level,
    bool multi = false,
  }) {
    final row = widget.row ?? {};
    final ids = multi
        ? List<String>.from(values[key] ?? [])
        : [if (values[key] != null) values[key].toString()];
    for (final p in row['projects'] ?? []) names[p['id']] = p['name'];
    final initialName = {
      'roleId': 'role_name',
      'unitId': 'unit_name',
      'boqItemId': 'boq_name',
      'parentId': 'parent_name',
    }[key];
    return ListTile(
      title: Text(label),
      subtitle: Text(
        ids
            .map(
              (id) =>
                  names[id] ??
                  (row[initialName] ?? t('محدد', 'Selected')).toString(),
            )
            .join('، '),
      ),
      trailing: const Icon(Icons.expand_more),
      onTap: () => lookup(key, resource, label, level: level, multi: multi),
    );
  }

  Future<void> save() async {
    if (busy || !form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await widget.api.call('/api/commands', {
        'command': resourceCommands[section],
        'data': values,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted)
        setState(() {
          busy = false;
          error = e.toString();
        });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: TrackHeader(
      api: widget.api,
      title: (widget.api.locale == 'ar'
          ? sectionArabic
          : sectionEnglish)[section]!,
      selectable: !busy,
      afterChange: () => Navigator.pop(context),
    ),
    body: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          field('name', t('الاسم', 'Name')),
          if (section == 'projects') ...[
            field('code', t('الكود', 'Code'), required: false),
            field('location', t('الموقع', 'Location'), required: false),
            field('client', t('العميل', 'Client'), required: false),
            field('details', t('التفاصيل', 'Details'), required: false),
          ],
          if (section == 'units') field('symbol', t('الرمز', 'Symbol')),
          if (section == 'boq') ...[
            DropdownButtonFormField<int>(
              initialValue: values['level'],
              items: [
                for (var i = 1; i <= 3; i++)
                  DropdownMenuItem(
                    value: i,
                    child: Text('${t('المستوى', 'Level')} $i'),
                  ),
              ],
              onChanged: widget.row != null
                  ? null
                  : (i) => setState(() {
                      values['level'] = i;
                      values['parentId'] = null;
                      values.remove('description');
                    }),
            ),
            if (values['level'] > 1)
              selector(
                'parentId',
                'boq',
                t('البند الأب', 'Parent item'),
                level: values['level'] - 1,
              ),
            if (values['level'] == 3) ...[
              field('description', t('الوصف', 'Description')),
              selector('unitId', 'units', t('الوحدة', 'Unit')),
              field('quantity', t('الكمية', 'Quantity')),
            ],
          ],
          if (section == 'materials') ...[
            selector('boqItemId', 'boq', t('البند', 'BOQ item'), level: 3),
            field('quantity', t('الكمية', 'Quantity')),
            selector('unitId', 'units', t('الوحدة', 'Unit')),
          ],
          if (section == 'users') ...[
            field('email', t('البريد الإلكتروني', 'Email')),
            field('username', t('اسم المستخدم', 'Username')),
            field('jobTitle', t('المسمى الوظيفي', 'Job title')),
            field(
              'password',
              t('كلمة المرور', 'Password'),
              required: widget.row == null,
              secret: true,
            ),
            selector('roleId', 'roles', t('الدور', 'Role')),
            selector(
              'projectIds',
              'projects',
              t('المشاريع المسندة', 'Assigned projects'),
              multi: true,
            ),
          ],
          if (section == 'roles')
            for (final permission in widget.profile['permissionCatalog'] ?? [])
              CheckboxListTile(
                title: Text(permission),
                value: (values['permissions'] as List).contains(permission),
                onChanged: (v) => setState(() {
                  final list = values['permissions'] as List;
                  v == true ? list.add(permission) : list.remove(permission);
                }),
              ),
          if (error.isNotEmpty) Text(error),
          FilledButton(
            onPressed: busy ? null : save,
            child: Text(t('حفظ', 'Save')),
          ),
        ],
      ),
    ),
  );
}

class ResourceLookup extends StatefulWidget {
  const ResourceLookup({
    super.key,
    required this.api,
    required this.resource,
    required this.project,
    required this.title,
    this.level,
  });
  final TrackApi api;
  final String resource, project, title;
  final int? level;
  @override
  State<ResourceLookup> createState() => _ResourceLookupState();
}

class _ResourceLookupState extends State<ResourceLookup> {
  final rows = <Map>[];
  String q = '', error = '';
  String? next;
  bool busy = false;
  int epoch = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    final current = ++epoch;
    setState(() {
      busy = true;
      error = '';
      if (!more) {
        rows.clear();
        next = null;
      }
    });
    try {
      final res = await widget.api.call(
        Uri(
          path: '/api/options',
          queryParameters: {
            'resource': widget.resource,
            'selectable': '1',
            if (q.isNotEmpty) 'q': q,
            if (widget.level != null) 'level': widget.level.toString(),
            if (widget.project.isNotEmpty &&
                ['boq', 'materials'].contains(widget.resource))
              'project': widget.project,
            if (next != null) 'cursor': next!,
          },
        ).toString(),
      );
      if (mounted && current == epoch)
        setState(() {
          rows.addAll((res['items'] as List).cast<Map>());
          next = res['next'];
        });
    } catch (e) {
      if (mounted && current == epoch) setState(() => error = e.toString());
    } finally {
      if (mounted && current == epoch) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: FractionallySizedBox(
      heightFactor: .7,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            decoration: InputDecoration(
              labelText: widget.title,
              prefixIcon: const Icon(Icons.search),
            ),
            onSubmitted: (v) {
              q = v.trim();
              load();
            },
          ),
          for (final r in rows)
            ListTile(
              title: Text(r['name']),
              onTap: () => Navigator.pop(context, r),
            ),
          if (busy) const LinearProgressIndicator(),
          if (error.isNotEmpty)
            TextButton(
              onPressed: () => load(more: rows.isNotEmpty),
              child: Text(error),
            ),
          if (next != null && !busy)
            TextButton(
              onPressed: () => load(more: true),
              child: Text(widget.api.locale == 'ar' ? 'المزيد' : 'More'),
            ),
        ],
      ),
    ),
  );
}
