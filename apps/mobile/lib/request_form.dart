import 'package:flutter/material.dart';
import 'api.dart';
import 'submissions.dart';
import 'track_header.dart';
import 'resource_editor.dart';

Future<bool?> openRequestForm(
  BuildContext context,
  TrackApi api,
  SubmissionQueue queue,
  String project,
  bool arabic,
) {
  return Navigator.of(context).push<bool>(
    MaterialPageRoute(
      builder: (_) =>
          RequestForm(api: api, queue: queue, project: project, arabic: arabic),
    ),
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
  Widget build(BuildContext context) => Scaffold(
    appBar: TrackHeader(
      api: widget.api,
      title: t('طلب جديد', 'New request'),
      afterChange: () => Navigator.pop(context),
    ),
    body: SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            onChanged: (v) => notes = v,
            decoration: InputDecoration(
              labelText: t('نطاق الاستخدام', 'Usage scope'),
            ),
          ),
          OutlinedButton.icon(
            icon: const Icon(Icons.add),
            label: Text(t('إضافة مادة', 'Add material')),
            onPressed: busy
                ? null
                : () async {
                    final m = await showModalBottomSheet<Map>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => ResourceLookup(
                        api: widget.api,
                        resource: 'materials',
                        project: widget.project,
                        title: t('اختيار المادة', 'Choose material'),
                      ),
                    );
                    if (m == null || !mounted) return;
                    final id = m['id'] as String;
                    setState(
                      () => lines.putIfAbsent(
                        id,
                        () => {'id': id, 'name': m['name'], 'quantity': '1'},
                      ),
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
    bottomNavigationBar: SafeArea(
      child: OverflowBar(
        children: [
          TextButton(
            onPressed: busy ? null : () => Navigator.pop(context, false),
            child: Text(t('إلغاء', 'Cancel')),
          ),
          FilledButton(
            onPressed: busy ? null : send,
            child: Text(t('إرسال', 'Submit')),
          ),
        ],
      ),
    ),
  );
}
