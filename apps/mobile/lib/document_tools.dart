import 'dart:convert';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'api.dart';
import 'track_header.dart';

const documents = MethodChannel('online.beyondtrack.app/device');
Map<String, String> headers(TrackApi api) {
  if (api.session == null) throw StateError('Session expired');
  return {
    'Origin': TrackApi.origin.origin,
    'Cookie': '__Host-bt=${api.session}; bt-locale=${api.locale}',
  };
}

Future<void> saveDownload(
  BuildContext context,
  TrackApi api,
  Uri uri,
  String name,
  String mime,
) async {
  try {
    final request = http.Request('GET', TrackApi.origin.resolveUri(uri))
      ..followRedirects = false
      ..headers.addAll(headers(api));
    final response = await http.Response.fromStream(await request.send());
    if (response.statusCode != 200)
      throw ApiFailure(response.statusCode, 'HTTP ${response.statusCode}');
    if (!context.mounted) return;
    api.pickingFile = true;
    try {
      await documents.invokeMethod('saveFile', {
        'bytes': response.bodyBytes,
        'name': name,
        'mime': mime,
      });
    } finally {
      api.pickingFile = false;
    }
  } catch (e) {
    if (context.mounted)
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
  }
}

Future<void> printDocument(
  BuildContext context,
  TrackApi api,
  String title,
  List<String> lines,
) async {
  try {
    api.pickingFile = true;
    await documents.invokeMethod('printDocument', {
      'title': title,
      'text': [title, ...lines].join('\n'),
      'rtl': api.locale == 'ar',
    });
  } catch (e) {
    if (context.mounted)
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
  } finally {
    api.pickingFile = false;
  }
}

class ImportBoq extends StatefulWidget {
  const ImportBoq({super.key, required this.api});
  final TrackApi api;
  @override
  State<ImportBoq> createState() => _ImportBoqState();
}

class _ImportBoqState extends State<ImportBoq> {
  List rows = [];
  bool valid = false, busy = false;
  String error = '';
  String t(String a, String b) => widget.api.locale == 'ar' ? a : b;
  Future<void> submit({bool commit = false, List? edited}) async {
    if (busy) return;
    final api = widget.api, project = widget.api.project.value.id;
    if (project.isEmpty) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final req =
          http.MultipartRequest('POST', TrackApi.origin.resolve('/api/import'))
            ..followRedirects = false
            ..headers.addAll(headers(api))
            ..fields['projectId'] = project;
      if (!commit) req.fields['preview'] = 'true';
      if (commit || edited != null) {
        req.fields['rows'] = jsonEncode(
          edited ?? rows.map((r) => r['values']).toList(),
        );
      } else {
        api.pickingFile = true;
        XFile? file;
        try {
          file = await openFile(
            acceptedTypeGroups: [
              const XTypeGroup(
                label: 'Excel / CSV',
                mimeTypes: [
                  'text/csv',
                  'application/vnd.ms-excel',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'text/comma-separated-values',
                ],
              ),
            ],
          );
        } finally {
          api.pickingFile = false;
        }
        if (file == null || !mounted) return;
        if (await file.length() > 4 * 1024 * 1024)
          throw StateError(t('الحد الأقصى ٤ ميغابايت', 'Maximum 4 MB'));
        req.files.add(
          http.MultipartFile.fromBytes(
            'file',
            await file.readAsBytes(),
            filename: file.name,
          ),
        );
      }
      final res = await http.Response.fromStream(await req.send());
      final data = jsonDecode(utf8.decode(res.bodyBytes));
      if (res.statusCode != 200)
        throw ApiFailure(
          res.statusCode,
          data['error'] ?? 'HTTP ${res.statusCode}',
        );
      if (!mounted) return;
      if (commit) {
        Navigator.pop(context, true);
        return;
      }
      setState(() {
        rows = data['items'];
        valid = data['valid'];
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: TrackHeader(
      api: widget.api,
      title: t('استيراد جدول الكميات', 'Import BOQ'),
      selectable: !busy,
      afterChange: () => Navigator.pop(context),
    ),
    body: ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: rows.length + 1,
      itemBuilder: (ctx, i) {
        if (i == 0)
          return Column(
            children: [
              OutlinedButton(
                onPressed: busy
                    ? null
                    : () => saveDownload(
                        context,
                        widget.api,
                        Uri(path: '/api/import'),
                        'materials-template.xlsx',
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      ),
                child: Text(t('تنزيل النموذج', 'Download template')),
              ),
              OutlinedButton.icon(
                icon: const Icon(Icons.upload_file),
                onPressed: busy ? null : () => submit(),
                label: Text(
                  t('اختيار ملف Excel أو CSV', 'Choose Excel or CSV file'),
                ),
              ),
              if (rows.isNotEmpty)
                FilledButton(
                  onPressed: busy || !valid ? null : () => submit(commit: true),
                  child: Text(t('تأكيد الاستيراد', 'Confirm import')),
                ),
              if (error.isNotEmpty) Text(error),
              if (busy) const LinearProgressIndicator(),
            ],
          );
        final r = rows[i - 1];
        final state = {
          'new': t('جديد', 'New'),
          'existing': t('موجود', 'Existing'),
          'duplicate': t('مكرر', 'Duplicate'),
          'error': t('خطأ', 'Error'),
        };
        return ListTile(
          title: Text((r['values'] as List).where((v) => v != '').join(' · ')),
          subtitle: Text(state[r['status']] ?? ''),
          trailing: IconButton(
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: busy
                ? null
                : () => submit(
                    edited: [
                      for (var j = 0; j < rows.length; j++)
                        if (j != i - 1) rows[j]['values'],
                    ],
                  ),
          ),
        );
      },
    ),
  );
}
