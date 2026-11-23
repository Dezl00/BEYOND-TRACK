import 'package:flutter/material.dart';
import 'api.dart';
import 'submissions.dart';

Future<bool?> openRequestForm(
  BuildContext context,
  TrackApi api,
  SubmissionQueue queue,
  String project,
  bool arabic,
) {
  return showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) =>
        RequestForm(api: api, queue: queue, project: project, arabic: arabic),
  );
}

class RequestForm extends StatefulWidget {
  const RequestForm({
    super.key,
    required this.api,
    required this.queue,
    required this.project,
    required this.arabic,
  });
  final TrackApi api;
  final SubmissionQueue queue;
  final String project;
  final bool arabic;
  @override
  State<RequestForm> createState() => _RequestFormState();
}

class _RequestFormState extends State<RequestForm> {
  late final materials = widget.api.call(
    '/api/options?resource=materials&selectable=1&project=${widget.project}',
  );
  final lines = <String, Map<String, String>>{};
  String notes = '', error = '';
  bool busy = false;
  String t(String a, String e) => widget.arabic ? a : e;
  Future<void> send() async {
    if (notes.trim().isEmpty ||
        lines.isEmpty ||
        lines.values.any(
          (line) =>
              !RegExp(
                r'^\d{1,12}(\.\d{1,3})?$',
              ).hasMatch(line['quantity'] ?? '') ||
              double.parse(line['quantity']!) <= 0,
        )) {
      setState(
        () => error = t(
          'أدخل نطاق الاستخدام والمادة والكمية',
          'Enter the usage scope, materials and quantities',
        ),
      );
      return;
    }
    setState(() => busy = true);
    try {
      await widget.queue.submit({
        'projectId': widget.project,
        'notes': notes.trim(),
        'lines': lines.values
            .map((l) => {'materialId': l['id'], 'quantity': l['quantity']})
            .toList(),
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
  Widget build(BuildContext context) => AlertDialog(
    title: Text(t('طلب جديد', 'New request')),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            onChanged: (v) => notes = v,
            decoration: InputDecoration(
              labelText: t('نطاق الاستخدام', 'Usage scope'),
            ),
          ),
          FutureBuilder<Map<String, dynamic>>(
            future: materials,
            builder: (c, s) {
              if (s.hasError) return Text(s.error.toString());
              if (!s.hasData) return const LinearProgressIndicator();
              return DropdownButton<String>(
                isExpanded: true,
                hint: Text(t('إضافة مادة', 'Add material')),
                items: [
                  for (final m in s.requireData['items'])
                    DropdownMenuItem(
                      value: m['id'] as String,
                      child: Text(m['name']),
                    ),
                ],
                onChanged: (id) {
                  if (id == null) return;
                  final m = (s.requireData['items'] as List).firstWhere(
                    (m) => m['id'] == id,
                  );
                  setState(
                    () => lines.putIfAbsent(
                      id,
                      () => {'id': id, 'name': m['name'], 'quantity': '1'},
                    ),
                  );
                },
              );
            },
          ),
          for (final line in lines.values)
            TextFormField(
              key: ValueKey(line['id']),
              initialValue: line['quantity'],
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onChanged: (v) => line['quantity'] = v,
              decoration: InputDecoration(
                labelText: line['name'],
                suffixIcon: IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() => lines.remove(line['id'])),
                ),
              ),
            ),
          if (error.isNotEmpty) Text(error),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: busy ? null : () => Navigator.pop(context, false),
        child: Text(t('إلغاء', 'Cancel')),
      ),
      FilledButton(
        onPressed: busy ? null : send,
        child: Text(t('إرسال', 'Submit')),
      ),
    ],
  );
}
