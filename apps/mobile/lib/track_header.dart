import 'package:flutter/material.dart';
import 'api.dart';
import 'track_widgets.dart';
import 'section_labels.dart';

Future<bool> prepareNavigation(
  BuildContext context,
  TrackApi api,
  List<String> paths,
) async {
  final session = api.session;
  try {
    await Future.wait(paths.map(api.prepare));
    return context.mounted &&
        session == api.session &&
        ModalRoute.of(context)?.isCurrent != false;
  } catch (error) {
    if (context.mounted && session == api.session) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.toString())));
    }
    return false;
  }
}

Future<void> chooseProject(
  BuildContext context,
  TrackApi api, {
  bool anchored = false,
}) async {
  final picker = _ProjectPicker(api: api, arabic: api.locale == 'ar');
  final selected = anchored
      ? await anchoredPanel<({String id, String name})>(
          context,
          picker,
          width: 232,
        )
      : await showDialog<({String id, String name})>(
          context: context,
          builder: (_) => Dialog(child: picker),
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
      final response = await widget.api.page(
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
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: const BoxConstraints(maxHeight: 268),
    child: ListTileTheme(
      data: const ListTileThemeData(
        dense: true,
        visualDensity: VisualDensity.compact,
      ),
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.symmetric(vertical: 6),
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
          if (busy) const LinearProgressIndicator(minHeight: 2),
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
    this.account,
    this.notifications,
    this.onRequest,
    this.back,
    this.afterChange,
    this.primary = false,
    this.selectable = true,
  });
  final TrackApi api;
  final ValueChanged<String>? onRequest;
  final String title;
  final bool home, primary, selectable;
  final VoidCallback? back, afterChange, account, notifications;
  @override
  Size get preferredSize => const Size.fromHeight(72);
  @override
  Widget build(BuildContext context) => AppBar(
    toolbarHeight: 72,
    automaticallyImplyLeading: false,
    centerTitle: false,
    leading: home || primary
        ? null
        : BackButton(onPressed: back ?? () => Navigator.maybePop(context)),
    title: home
        ? Row(
            children: [
              if (notifications != null)
                Builder(
                  builder: (anchor) => IconButton(
                    tooltip: api.locale == 'ar' ? 'الإشعارات' : 'Notifications',
                    onPressed: () async {
                      final result = await anchoredPanel<String>(
                        anchor,
                        _NotificationMenu(api: api),
                        width: 312,
                      );
                      if (!anchor.mounted || result == null) return;
                      if (result == 'all') {
                        notifications?.call();
                      } else {
                        onRequest?.call(result);
                      }
                    },
                    icon: const Icon(Icons.notifications_none_rounded),
                  ),
                ),
              if (selectable)
                Expanded(
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: projectPicker(),
                  ),
                )
              else
                const Spacer(),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      api.locale == 'ar' ? 'أهلاً' : 'Hello',
                      style: const TextStyle(fontSize: 11),
                    ),
                    Text(
                      title.trim().split(RegExp(r'\s+')).first,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: api.locale == 'ar' ? 'الحساب' : 'Account',
                onPressed: account,
                style: IconButton.styleFrom(
                  backgroundColor: Colors.white.withValues(alpha: .16),
                  foregroundColor: Colors.white,
                ),
                icon: const Icon(Icons.person_rounded, size: 22),
              ),
            ],
          )
        : Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
          ),
    actions: [if (!home && selectable) projectPicker()],
  );

  Widget projectPicker() => ValueListenableBuilder(
    valueListenable: api.project,
    builder: (ctx, value, _) => ConstrainedBox(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(ctx).width * .40),
      child: TextButton(
        style: TextButton.styleFrom(foregroundColor: Colors.white),
        onPressed: () async {
          final old = api.project.value.id;
          await chooseProject(ctx, api, anchored: true);
          if (ctx.mounted && old != api.project.value.id) afterChange?.call();
        },
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                value.name.isEmpty
                    ? (api.locale == 'ar' ? 'كل المشاريع' : 'All projects')
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
  );
}

class _NotificationMenu extends StatefulWidget {
  const _NotificationMenu({required this.api});
  final TrackApi api;
  @override
  State<_NotificationMenu> createState() => _NotificationMenuState();
}

class _NotificationMenuState extends State<_NotificationMenu> {
  late Future<Map<String, dynamic>> page = fetch();
  bool saving = false;
  String error = '';
  bool get ar => widget.api.locale == 'ar';
  Future<Map<String, dynamic>> fetch() =>
      widget.api.page('/api/v1/pages/notifications', force: true);
  Future<void> read([Map? item]) async {
    if (saving) return;
    setState(() {
      saving = true;
      error = '';
    });
    try {
      if (item == null || item['read_at'] == null) {
        await widget.api.call('/api/commands', {
          'command': 'notification-read',
          'data': {if (item != null) 'id': item['id']},
        });
      }
      if (!mounted) return;
      if (item != null) {
        Navigator.pop(context, item['request_id']);
      } else {
        setState(() {
          page = fetch();
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: const BoxConstraints(maxHeight: 320),
    child: ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.all(10),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                ar ? 'الإشعارات' : 'Notifications',
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ),
            TextButton(
              onPressed: saving ? null : () => read(),
              child: Text(ar ? 'قراءة الكل' : 'Mark all read'),
            ),
          ],
        ),
        FutureBuilder<Map<String, dynamic>>(
          future: page,
          builder: (ctx, state) {
            if (state.hasError)
              return TextButton(
                onPressed: () => setState(() {
                  page = fetch();
                }),
                child: Text(ar ? 'إعادة المحاولة' : 'Retry'),
              );
            if (!state.hasData)
              return const LinearProgressIndicator(minHeight: 2);
            final items = state.requireData['items'] as List;
            return Column(
              children: [
                if (items.isEmpty)
                  Text(ar ? 'لا توجد إشعارات' : 'No notifications'),
                for (final row in items.take(5))
                  ListTile(
                    dense: true,
                    leading: Icon(
                      row['read_at'] == null
                          ? Icons.mark_email_unread_outlined
                          : Icons.drafts_outlined,
                      size: 17,
                    ),
                    title: Text(
                      (ar
                          ? notificationsArabic
                          : notificationsEnglish)[row['type']],
                    ),
                    subtitle: Text(row['number'].toString()),
                    onTap: saving ? null : () => read(row),
                  ),
              ],
            );
          },
        ),
        if (error.isNotEmpty) Text(error),
        TextButton(
          onPressed: () => Navigator.pop(context, 'all'),
          child: Text(ar ? 'عرض كل الإشعارات' : 'View all notifications'),
        ),
      ],
    ),
  );
}
