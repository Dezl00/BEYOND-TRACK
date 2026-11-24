import 'package:flutter/material.dart';
import 'api.dart';
import 'resource_editor.dart';

const catalogLevels = ['mains', 'seconds', 'leaves'];

class CatalogFilters extends StatefulWidget {
  const CatalogFilters({
    super.key,
    required this.api,
    required this.initial,
    required this.materials,
  });
  final TrackApi api;
  final Map<String, Map> initial;
  final bool materials;
  @override
  State<CatalogFilters> createState() => _CatalogFiltersState();
}

class _CatalogFiltersState extends State<CatalogFilters> {
  late final selected = Map.of(widget.initial);
  int? picking;
  bool get ar => widget.api.locale == 'ar';
  List<String> get labels => ar
      ? ['القسم الرئيسي', 'القسم الثانوي', 'القسم الفرعي']
      : ['Main section', 'Secondary section', 'Subsection'];
  void change(int i, Map? row) => setState(() {
    for (final key in catalogLevels.skip(i)) {
      selected.remove(key);
    }
    if (row != null) selected[catalogLevels[i]] = row;
    picking = null;
  });
  @override
  Widget build(BuildContext context) {
    final level = picking;
    if (level != null)
      return SizedBox(
        height: 290,
        child: Column(
          children: [
            ListTile(
              dense: true,
              title: Text(labels[level]),
              leading: BackButton(
                onPressed: () => setState(() => picking = null),
              ),
            ),
            Expanded(
              child: ResourceLookup(
                api: widget.api,
                resource: 'boq',
                project: widget.api.project.value.id,
                title: ar ? 'بحث' : 'Search',
                level: level + 1,
                filters: {
                  for (final k in catalogLevels.take(level))
                    if (selected[k] != null) k: selected[k]!['id'],
                },
                onPick: (row) => change(level, row),
              ),
            ),
          ],
        ),
      );
    return Padding(
      padding: const EdgeInsets.all(10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = widget.materials ? 0 : 1; i < 3; i++)
            ListTile(
              dense: true,
              title: Text(labels[i]),
              subtitle: Text(
                selected[catalogLevels[i]]?['name'] ?? (ar ? 'الكل' : 'All'),
              ),
              trailing: selected[catalogLevels[i]] == null
                  ? const Icon(Icons.expand_more)
                  : IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => change(i, null),
                    ),
              onTap: () => setState(() => picking = i),
            ),
          Row(
            children: [
              TextButton(
                onPressed: () => Navigator.pop(context, <String, Map>{}),
                child: Text(ar ? 'مسح' : 'Clear'),
              ),
              const Spacer(),
              FilledButton(
                onPressed: () => Navigator.pop(context, selected),
                child: Text(ar ? 'تطبيق' : 'Apply'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class DeleteResourceDialog extends StatefulWidget {
  const DeleteResourceDialog({
    super.key,
    required this.api,
    required this.resource,
    required this.row,
  });
  final TrackApi api;
  final String resource;
  final Map row;
  @override
  State<DeleteResourceDialog> createState() => _DeleteResourceDialogState();
}

class _DeleteResourceDialogState extends State<DeleteResourceDialog> {
  String? challenge;
  String code = '', error = '';
  bool busy = false;
  bool get project => widget.resource == 'project';
  String t(String a, String e) => widget.api.locale == 'ar' ? a : e;
  Future<void> submit() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final res = await widget.api.call('/api/commands', {
        'command': project
            ? (challenge == null
                  ? 'project-delete-code'
                  : 'project-delete-confirm')
            : 'delete',
        'data': project
            ? {
                'projectId': widget.row['id'],
                if (challenge != null) ...{
                  'challenge': challenge,
                  'code': code,
                },
              }
            : {'resource': widget.resource, 'id': widget.row['id']},
      });
      if (!mounted) return;
      if (project && challenge == null) {
        setState(() => challenge = res['challenge']);
      } else {
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: AlertDialog(
      title: Text(t('حذف', 'Delete') + ' · ' + widget.row['name']),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            project
                ? t(
                    'سيُحذف المشروع وطلباته وبياناته نهائياً.',
                    'This permanently deletes the project, its requests and associated data.',
                  )
                : t('هل تريد حذف هذا السجل؟', 'Delete this record?'),
          ),
          if (challenge != null)
            TextField(
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: InputDecoration(
                labelText: t('رمز التحقق المرسل', 'Verification code sent'),
              ),
              onChanged: (v) => setState(() => code = v.trim()),
            ),
          if (error.isNotEmpty) Text(error),
        ],
      ),
      actions: [
        TextButton(
          onPressed: busy ? null : () => Navigator.pop(context),
          child: Text(t('إلغاء', 'Cancel')),
        ),
        FilledButton(
          onPressed: busy || (challenge != null && code.length != 6)
              ? null
              : submit,
          child: Text(
            project && challenge == null
                ? t('إرسال الرمز', 'Send code')
                : t('حذف', 'Delete'),
          ),
        ),
      ],
    ),
  );
}
