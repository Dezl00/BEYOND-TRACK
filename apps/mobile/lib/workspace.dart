import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'api.dart';

/// Hosts the same authenticated workflow and role-filtered navigation as the web client.
class Workspace extends StatefulWidget {
  const Workspace({
    super.key,
    required this.api,
    required this.path,
    required this.dark,
    required this.close,
    required this.expired,
    required this.rotated,
    required this.choosingFile,
  });
  final TrackApi api;
  final String path;
  final bool dark;
  final VoidCallback close;
  final Future<void> Function() expired;
  final VoidCallback rotated;
  final ValueChanged<bool> choosingFile;
  @override
  State<Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<Workspace> {
  static const device = MethodChannel('online.beyondtrack.app/device');
  late final controller = WebViewController();
  bool ready = false, loading = true, failed = false;
  bool get arabic => widget.api.locale == 'ar';
  @override
  void initState() {
    super.initState();
    initialize();
  }

  Future<void> initialize() async {
    try {
      final platform = controller.platform as AndroidWebViewController;
      final origin = TrackApi.origin;
      final uri = origin.resolve(widget.path);
      if (origin.scheme != 'https' || uri.origin != origin.origin)
        throw StateError('Invalid workspace');
      await controller.setBackgroundColor(
        widget.dark ? Colors.black : Colors.white,
      );
      await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      await controller.setUserAgent(
        '${await controller.getUserAgent()} BeyondTrackAndroid/1',
      );
      await controller.setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final link = Uri.tryParse(request.url);
            if (link == null ||
                link.scheme != 'https' ||
                link.origin != origin.origin) {
              if (link?.scheme == 'https' &&
                  link?.host == 'res.cloudinary.com' &&
                  request.isMainFrame) {
                device.invokeMethod<void>('openAttachment', {
                  'url': link.toString(),
                });
              }
              return NavigationDecision.prevent;
            }
            if (request.isMainFrame && link.path == '/login') {
              widget.expired();
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onPageStarted: (_) {
            if (mounted)
              setState(() {
                loading = true;
                failed = false;
              });
          },
          onPageFinished: (url) async {
            if (!mounted) return;
            setState(() => loading = false);
            if (Uri.tryParse(url)?.path == '/login') {
              await widget.expired();
              return;
            }
            await controller.runJavaScript(
              'window.print = () => TrackPrint.postMessage("print")',
            );
          },
          onWebResourceError: (error) {
            if (mounted && error.isForMainFrame == true)
              setState(() {
                failed = true;
                loading = false;
              });
          },
        ),
      );
      await controller.addJavaScriptChannel(
        'TrackSession',
        onMessageReceived: (_) async {
          final api = widget.api, old = api.session;
          final token = await device.invokeMethod<String>('workspaceSession', {
            'origin': TrackApi.origin.origin,
          });
          if (!mounted ||
              old == null ||
              api.session != old ||
              token == old ||
              token == null ||
              !RegExp(r'^[0-9a-f]{64}$').hasMatch(token))
            return;
          api.session = token;
          await api.storage.write(key: 'session', value: token);
          await api.cache.erase(old);
          if (mounted) widget.rotated();
        },
      );
      await controller.addJavaScriptChannel(
        'TrackPrint',
        onMessageReceived: (_) async {
          if (mounted)
            await device.invokeMethod('printPage', {
              'view': platform.webViewIdentifier,
            });
        },
      );
      await platform.setOnShowFileSelector((params) async {
        widget.choosingFile(true);
        try {
          return await device.invokeListMethod<String>('pickFiles', {
                'multiple': params.mode == FileSelectorMode.openMultiple,
                'accept': params.acceptTypes,
                'capture': params.isCaptureEnabled,
              }) ??
              [];
        } finally {
          widget.choosingFile(false);
        }
      });
      if (!mounted) return;
      await device.invokeMethod('prepareWorkspace', {
        'origin': origin.origin,
        'session': widget.api.session,
        'locale': widget.api.locale,
        'dark': widget.dark,
        'view': platform.webViewIdentifier,
      });
      if (!mounted) return;
      setState(() => ready = true);
      await controller.loadRequest(uri);
    } catch (_) {
      if (mounted)
        setState(() {
          failed = true;
          loading = false;
        });
    }
  }

  Future<void> back() async {
    if (ready && await controller.canGoBack()) {
      await controller.goBack();
    } else if (mounted) {
      widget.close();
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (popped, _) {
      if (!popped) back();
    },
    child: Scaffold(
      appBar: AppBar(
        leading: BackButton(onPressed: back),
        title: Text(arabic ? 'مساحة العمل' : 'Workspace'),
        actions: [
          IconButton(
            onPressed: widget.close,
            icon: const Icon(Icons.close),
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
          ),
        ],
      ),
      body: SafeArea(
        child: Stack(
          children: [
            if (ready && !failed) WebViewWidget(controller: controller),
            if (loading) const LinearProgressIndicator(),
            if (failed)
              Center(
                child: FilledButton(
                  onPressed: () {
                    setState(() {
                      loading = true;
                      failed = false;
                    });
                    if (ready) {
                      controller.loadRequest(
                        TrackApi.origin.resolve(widget.path),
                      );
                    } else {
                      initialize();
                    }
                  },
                  child: Text(
                    arabic
                        ? 'تعذر تحميل الصفحة · إعادة المحاولة'
                        : 'Page unavailable · Retry',
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
