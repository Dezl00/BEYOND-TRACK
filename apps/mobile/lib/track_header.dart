import 'package:flutter/material.dart';
import 'api.dart';

Future<void> chooseProject(BuildContext context, TrackApi api) async {
  final ar = api.locale == 'ar';
  final selected = await showModalBottomSheet<({String id, String name})>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _ProjectPicker(api: api, arabic: ar),
  );
  if (selected != null && context.mounted) api.project.value = selected;
}

class _ProjectPicker extends StatefulWidget {
  const _ProjectPicker({required this.api, required this.arabic});
  final TrackApi api;
  final bool arabic;
  @override
  State<_ProjectPicker> createState() => _ProjectPickerState();
}

class _ProjectPickerState extends State<_ProjectPicker> {
  final items = <Map>[];
  String? cursor, issue;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (busy) return;
    setState(() {
      busy = true;
      issue = null;
    });
    try {
      final response = await widget.api.call(
        Uri(
          path: '/api/options',
          queryParameters: {
            'resource': 'projects',
            if (cursor != null) 'cursor': cursor!,
          },
        ).toString(),
      );
      if (mounted)
        setState(() {
          items.addAll((response['items'] as List).cast<Map>());
          cursor = response['next'];
        });
    } catch (e) {
      if (mounted) setState(() => issue = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: FractionallySizedBox(
      heightFactor: .65,
      child: ListView(
        children: [
          ListTile(
            title: Text(widget.arabic ? 'كل المشاريع' : 'All projects'),
            onTap: () => Navigator.pop(context, (id: '', name: '')),
          ),
          for (final row in items)
            ListTile(
              title: Text(row['name']),
              trailing: row['id'] == widget.api.project.value.id
                  ? const Icon(Icons.check)
                  : null,
              onTap: () => Navigator.pop(context, (
                id: row['id'] as String,
                name: row['name'] as String,
              )),
            ),
          if (busy) const Center(child: CircularProgressIndicator()),
          if (issue != null)
            ListTile(
              title: Text(issue!),
              subtitle: Text(widget.arabic ? 'إعادة المحاولة' : 'Retry'),
              onTap: load,
            ),
          if (!busy && issue == null && cursor != null)
            TextButton(
              onPressed: load,
              child: Text(widget.arabic ? 'المزيد' : 'More'),
            ),
        ],
      ),
    ),
  );
}

class TrackHeader extends StatelessWidget implements PreferredSizeWidget {
  const TrackHeader({
    super.key,
    required this.api,
    required this.title,
    this.home = false,
    this.back,
    this.afterChange,
    this.primary = false,
    this.selectable = true,
  });
  final TrackApi api;
  final String title;
  final bool home, primary, selectable;
  final VoidCallback? back, afterChange;
  @override
  Size get preferredSize => const Size.fromHeight(72);
  @override
  Widget build(BuildContext context) => AppBar(
    toolbarHeight: 72,
    automaticallyImplyLeading: false,
    centerTitle: false,
    leading: home
        ? Padding(
            padding: const EdgeInsets.all(10),
            child: Image.asset('assets/brand/mark.png'),
          )
        : primary
        ? null
        : BackButton(onPressed: back ?? () => Navigator.maybePop(context)),
    title: Text(
      title,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
    ),
    actions: [
      if (selectable)
        ValueListenableBuilder(
          valueListenable: api.project,
          builder: (ctx, value, _) => ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(ctx).width * .40,
            ),
            child: TextButton(
              style: TextButton.styleFrom(foregroundColor: Colors.white),
              onPressed: () async {
                final old = api.project.value.id;
                await chooseProject(ctx, api);
                if (ctx.mounted && old != api.project.value.id)
                  afterChange?.call();
              },
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: Text(
                      value.name.isEmpty
                          ? (api.locale == 'ar'
                                ? 'كل المشاريع'
                                : 'All projects')
                          : value.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Icon(Icons.expand_more, size: 18),
                ],
              ),
            ),
          ),
        ),
    ],
  );
}
