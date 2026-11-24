import 'package:flutter/material.dart';
import 'api.dart';
import 'track_header.dart';

class RequestOperation extends StatefulWidget {
  const RequestOperation({
    super.key,
    required this.api,
    required this.request,
    required this.action,
    required this.title,
  });
  final TrackApi api;
  final Map request;
  final String action, title;
  @override
  State<RequestOperation> createState() => _RequestOperationState();
}

class _RequestOperationState extends State<RequestOperation> {
  final key = TrackApi.operationId();
  final evidence = <Map<String, String>>[],
      alternatives = <Map<String, String>>[];
  final amounts = <String, Map<String, String>>{},
      decisions = <String, bool>{},
      comments = <String, String>{};
  late String notes = widget.action == 'edit'
      ? widget.request['notes'] ?? ''
      : '';
  String date = '', supplier = '', error = '';
  bool busy = false;
  String get action => widget.action;
  List get lines => widget.request['lines'];
  String t(String a, String b) => widget.api.locale == 'ar' ? a : b;
  late final suppliers = widget.api.call(
    '/api/options?resource=suppliers&selectable=1',
  );
  Future<void> attach(String purpose, List<Map<String, String>> files) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final added = await widget.api.pickAttachments(
        widget.request['id'],
        purpose,
        key,
      );
      if (mounted) files.addAll(added);
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> save() async {
    if (busy) return;
    final req = widget.request;
    final data = <String, dynamic>{'id': req['id'], 'version': req['version']};
    final ids = evidence.map((e) => e['id']).toList();
    var cmd = action;
    switch (action) {
      case 'technicalReview':
        cmd = 'technical-review';
        data['lines'] = [
          for (final l in lines)
            {
              'id': l['id'],
              'approved': decisions[l['id']],
              'note': comments[l['id']] ?? '',
            },
        ];
      case 'quotations':
        data.addAll({
          'selectedIndex': 0,
          'offers': [
            {
              'supplierId': supplier,
              'expectedAt': date,
              'prices': [
                for (final l in lines)
                  {'id': l['id'], 'price': amounts[l['id']]?['price'] ?? ''},
              ],
            },
          ],
          'uploadKey': key,
          'attachmentIds': ids,
          'alternativeAttachmentIds': alternatives.map((e) => e['id']).toList(),
        });
      case 'payment':
      case 'invoice':
        cmd = action == 'payment' ? 'order' : 'invoice';
        data.addAll({'key': key, 'attachmentIds': ids});
      case 'receive':
        cmd = 'receipt';
        data.clear();
        data.addAll({
          'requestId': req['id'],
          'key': key,
          'attachmentIds': ids,
          'notes': notes,
          'lines': [
            for (final l in lines)
              {
                'lineId': l['id'],
                for (final k in [
                  'accepted',
                  'damaged',
                  'rejected',
                  'returned',
                  'notReceived',
                ])
                  k: amounts[l['id']]?[k] ?? '0',
              },
          ],
        });
      case 'edit':
        cmd = 'request';
        data.addAll({
          'projectId': req['project_id'],
          'notes': notes,
          'requiredBy': req['required_by']?.toString().split('T').first ?? '',
          'lines': [
            for (final l in lines)
              {
                'materialId': l['material_id'],
                'quantity':
                    amounts[l['id']]?['quantity'] ?? l['quantity'].toString(),
                'notes': l['notes'] ?? '',
              },
          ],
        });
      case 'overage':
        data.remove('version');
    }
    if (action == 'technicalReview' &&
        lines.any(
          (l) =>
              decisions[l['id']] == null ||
              (decisions[l['id']] == false &&
                  (comments[l['id']] ?? '').trim().isEmpty),
        )) {
      setState(
        () => error = t(
          'راجع كل مادة وأدخل سبب الرفض',
          'Review every item and enter a reason for each rejection',
        ),
      );
      return;
    }
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await widget.api.call('/api/commands', {'command': cmd, 'data': data});
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted)
        setState(() {
          busy = false;
          error = e.toString();
        });
    }
  }

  Widget evidencePicker(
    String purpose,
    List<Map<String, String>> files,
    String label,
  ) => Column(
    children: [
      for (final f in files)
        ListTile(
          title: Text(f['name']!),
          trailing: IconButton(
            icon: const Icon(Icons.close),
            onPressed: busy ? null : () => setState(() => files.remove(f)),
          ),
        ),
      OutlinedButton.icon(
        icon: const Icon(Icons.attach_file),
        onPressed: busy ? null : () => attach(purpose, files),
        label: Text(label),
      ),
    ],
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: TrackHeader(
      api: widget.api,
      title: widget.title,
      selectable: !busy,
      afterChange: () => Navigator.pop(context),
    ),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          widget.request['number'].toString(),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        if (action == 'quotations') ...[
          FutureBuilder(
            future: suppliers,
            builder: (_, s) {
              if (s.hasError) return Text(s.error.toString());
              if (!s.hasData) return const LinearProgressIndicator();
              return DropdownButtonFormField<String>(
                decoration: InputDecoration(labelText: t('المورد', 'Supplier')),
                items: [
                  for (final v in s.requireData['items'])
                    DropdownMenuItem(
                      value: v['id'] as String,
                      child: Text(v['name']),
                    ),
                ],
                onChanged: (id) => supplier = id ?? '',
              );
            },
          ),
          ListTile(
            title: Text(t('تاريخ التوريد', 'Expected delivery')),
            subtitle: Text(date),
            onTap: () async {
              final d = await showDatePicker(
                context: context,
                firstDate: DateTime(2020),
                lastDate: DateTime(2100),
                initialDate: DateTime.now(),
              );
              if (d != null && mounted)
                setState(() => date = d.toIso8601String().split('T').first);
            },
          ),
        ],
        if (['receive', 'edit'].contains(action))
          TextFormField(
            initialValue: notes,
            onChanged: (v) => notes = v,
            decoration: InputDecoration(labelText: t('ملاحظات', 'Notes')),
          ),
        if ([
          'quotations',
          'receive',
          'edit',
          'technicalReview',
          'overage',
        ].contains(action))
          for (final l in lines) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(l['material_name']),
              subtitle: Text("${l['quantity']} ${l['unit_name'] ?? ''}"),
            ),
            if (action == 'technicalReview') ...[
              SegmentedButton<bool>(
                emptySelectionAllowed: true,
                segments: [
                  ButtonSegment(
                    value: true,
                    label: Text(t('اعتماد', 'Approve')),
                  ),
                  ButtonSegment(value: false, label: Text(t('رفض', 'Reject'))),
                ],
                selected: {
                  if (decisions.containsKey(l['id'])) decisions[l['id']]!,
                },
                onSelectionChanged: (v) => setState(() {
                  if (v.isEmpty) {
                    decisions.remove(l['id']);
                  } else {
                    decisions[l['id']] = v.first;
                  }
                }),
              ),
              TextField(
                onChanged: (v) => comments[l['id']] = v,
                maxLength: 1000,
                decoration: InputDecoration(
                  labelText: decisions[l['id']] == false
                      ? t('سبب الرفض', 'Rejection reason')
                      : t('ملاحظة', 'Note'),
                ),
              ),
            ] else
              for (final e
                  in (action == 'receive'
                          ? {
                              'accepted': t('مقبول', 'Accepted'),
                              'damaged': t('تالف', 'Damaged'),
                              'rejected': t('مرفوض', 'Rejected'),
                              'returned': t('مرتجع', 'Returned'),
                              'notReceived': t('لم يستلم', 'Not received'),
                            }
                          : action == 'edit'
                          ? {'quantity': t('الكمية', 'Quantity')}
                          : action == 'quotations'
                          ? {'price': t('السعر', 'Price')}
                          : <String, String>{})
                      .entries)
                TextFormField(
                  initialValue: action == 'edit'
                      ? l['quantity'].toString()
                      : null,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(labelText: e.value),
                  onChanged: (v) => (amounts[l['id']] ??= {})[e.key] = v,
                ),
          ],
        if (['quotations', 'payment', 'invoice', 'receive'].contains(action))
          evidencePicker(
            {'quotations': 'quotation', 'receive': 'receipt'}[action] ?? action,
            evidence,
            t('إرفاق المستند', 'Attach evidence'),
          ),
        if (action == 'quotations')
          evidencePicker(
            'alternative',
            alternatives,
            t('عروض بديلة', 'Alternative offers'),
          ),
        if (error.isNotEmpty) Text(error),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: busy ? null : save,
          child: Text(t('تأكيد وحفظ', 'Confirm and save')),
        ),
      ],
    ),
  );
}
