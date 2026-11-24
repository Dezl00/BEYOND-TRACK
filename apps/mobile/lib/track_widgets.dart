import 'dart:async';
import 'package:flutter/material.dart';
import 'section_labels.dart';

const trackBlue = Color(0xff0759ea);
const trackGreen = Color(0xff198451);

String quantityText(dynamic value) {
  final text = value?.toString() ?? '';
  return text.contains('.') && RegExp(r'^\d+\.\d+$').hasMatch(text)
      ? text.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '')
      : text;
}

String displayDate(BuildContext context, dynamic value, {bool time = false}) {
  final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
  if (date == null) return '—';
  final format = MaterialLocalizations.of(context);
  final day = format.formatCompactDate(date);
  return time
      ? '$day · ${format.formatTimeOfDay(TimeOfDay.fromDateTime(date))}'
      : day;
}

class LiveSearch extends StatefulWidget {
  const LiveSearch({
    super.key,
    required this.label,
    required this.changed,
    this.initialQuery = '',
  });
  final String initialQuery;
  final String label;
  final ValueChanged<String> changed;
  @override
  State<LiveSearch> createState() => _LiveSearchState();
}

class _LiveSearchState extends State<LiveSearch> {
  Timer? timer;
  late final controller = TextEditingController(text: widget.initialQuery);
  @override
  void dispose() {
    timer?.cancel();
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    style: const TextStyle(fontSize: 13),
    textInputAction: TextInputAction.search,
    onChanged: (v) {
      timer?.cancel();
      timer = Timer(
        const Duration(milliseconds: 180),
        () => widget.changed(v.trim()),
      );
    },
    decoration: InputDecoration(
      hintText: widget.label,
      isDense: true,
      filled: true,
      contentPadding: const EdgeInsets.symmetric(vertical: 9, horizontal: 12),
      prefixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 36),
      prefixIcon: const Icon(Icons.search_rounded, size: 18),
    ),
  );
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(
    this.status,
    this.arabic, {
    super.key,
    this.compact = false,
  });
  final int? status;
  final bool arabic, compact;
  @override
  Widget build(BuildContext context) {
    final labels = arabic ? statusesArabic : statusesEnglish;
    final label = status != null && status! >= 0 && status! < labels.length
        ? labels[status!]
        : '—';
    final (bg, fg) = switch (status) {
      5 || 6 || 11 => (0xffdef6e8, 0xff11613e),
      7 || 8 || 14 => (0xffffe7e7, 0xff993438),
      4 || 9 || 10 || 13 => (0xffffefcc, 0xff815715),
      0 => (0xffedf0f4, 0xff485364),
      _ => (0xffe5efff, 0xff204eaa),
    };
    return Tooltip(
      message: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: Color(bg),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          maxLines: compact ? 2 : null,
          overflow: compact ? TextOverflow.ellipsis : null,
          style: TextStyle(
            color: Color(fg),
            fontSize: 11,
            height: 1.2,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class StatusTabs extends StatelessWidget {
  const StatusTabs({
    super.key,
    required this.statuses,
    required this.value,
    required this.arabic,
    required this.changed,
  });
  final List<int> statuses;
  final int? value;
  final bool arabic;
  final ValueChanged<int?> changed;
  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).colorScheme;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final id in <int?>[null, ...statuses])
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 6),
              child: ChoiceChip(
                showCheckmark: false,
                selected: value == id,
                selectedColor: trackBlue,
                backgroundColor: palette.onSurface.withValues(alpha: .07),
                side: BorderSide.none,
                shape: const StadiumBorder(),
                labelStyle: TextStyle(
                  fontSize: 12,
                  color: value == id ? Colors.white : palette.onSurface,
                ),
                label: Text(
                  id == null
                      ? (arabic ? 'الكل' : 'All')
                      : (arabic ? statusesArabic : statusesEnglish)[id],
                ),
                onSelected: (_) => changed(id),
              ),
            ),
        ],
      ),
    );
  }
}

Future<T?> anchoredPanel<T>(
  BuildContext anchor,
  Widget child, {
  double width = 280,
}) {
  final overlay =
      Navigator.of(anchor).overlay!.context.findRenderObject() as RenderBox;
  final box = anchor.findRenderObject() as RenderBox;
  final offset = box.localToGlobal(Offset.zero, ancestor: overlay);
  final bounds = Rect.fromLTWH(
    offset.dx,
    offset.dy + box.size.height,
    box.size.width,
    0,
  );
  return showMenu<T>(
    context: anchor,
    elevation: 3,
    color: Theme.of(anchor).colorScheme.surface,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    menuPadding: EdgeInsets.zero,
    constraints: BoxConstraints(maxWidth: width),
    position: RelativeRect.fromRect(bounds, Offset.zero & overlay.size),
    items: [
      _PanelEntry<T>(
        child: SizedBox(width: width, child: child),
      ),
    ],
  );
}

class _PanelEntry<T> extends PopupMenuEntry<T> {
  const _PanelEntry({required this.child});
  final Widget child;
  @override
  double get height => 0;
  @override
  bool represents(T? value) => false;
  @override
  State<_PanelEntry<T>> createState() => _PanelEntryState<T>();
}

class _PanelEntryState<T> extends State<_PanelEntry<T>> {
  @override
  Widget build(BuildContext context) => widget.child;
}

class RequestTable extends StatelessWidget {
  const RequestTable({
    super.key,
    required this.items,
    required this.arabic,
    required this.open,
  });
  final List items;
  final bool arabic;
  final ValueChanged<String> open;
  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurface;
    Widget cell(Widget child) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 5),
      child: child,
    );
    return Table(
      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
      columnWidths: const {
        0: FlexColumnWidth(1.1),
        1: FlexColumnWidth(.9),
        2: FlexColumnWidth(1.35),
      },
      children: [
        TableRow(
          children: [
            for (final title
                in (arabic
                    ? ['رقم الطلب', 'التاريخ', 'الحالة']
                    : ['Request', 'Date', 'Status']))
              cell(
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 11,
                    color: color.withValues(alpha: .66),
                  ),
                ),
              ),
          ],
        ),
        for (final item in items)
          TableRow(
            decoration: BoxDecoration(
              color: color.withValues(alpha: .05),
              border: Border(
                bottom: BorderSide(
                  width: 3,
                  color: Theme.of(context).scaffoldBackgroundColor,
                ),
              ),
            ),
            children: [
              for (final child in <Widget>[
                Text(
                  item['number'].toString(),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  displayDate(context, item['created_at']),
                  style: const TextStyle(fontSize: 11),
                ),
                StatusBadge(item['status'], arabic, compact: true),
              ])
                InkWell(onTap: () => open(item['id']), child: cell(child)),
            ],
          ),
      ],
    );
  }
}

class DateField extends StatelessWidget {
  const DateField({
    super.key,
    required this.label,
    required this.value,
    required this.changed,
  });
  final String label, value;
  final ValueChanged<String> changed;
  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    dense: true,
    title: Text(label),
    subtitle: Text(value.isEmpty ? '—' : value),
    leading: const Icon(Icons.event_outlined),
    trailing: value.isEmpty
        ? null
        : IconButton(
            icon: const Icon(Icons.clear, size: 16),
            onPressed: () => changed(''),
          ),
    onTap: () async {
      final date = await showDatePicker(
        context: context,
        firstDate: DateTime(1900),
        lastDate: DateTime(2200),
        initialDate: DateTime.tryParse(value) ?? DateTime.now(),
      );
      if (date != null && context.mounted)
        changed(date.toIso8601String().split('T').first);
    },
  );
}
