import 'dart:async';
import 'package:beyond_track/api.dart';
import 'package:beyond_track/page_cache.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:beyond_track/sections.dart';
import 'package:beyond_track/overview.dart';
import 'package:beyond_track/track_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class MemoryCache extends PageCache {
  final entries = <String,({Map<String,dynamic> body, DateTime expiry})>{};
  @override
  Future<({Map<String,dynamic> body, DateTime expiry})?> readEntry(String session,String path) async => entries['$session:$path'];
  @override
  Future<void> save(String session,String path,Map<String,dynamic> body,DateTime expires) async {entries['$session:$path']=(body:body,expiry:expires);}
  @override
  Future<void> erase(String session) async {entries.removeWhere((k,v)=>k.startsWith('$session:'));}
}

class FakeApi extends TrackApi {
  FakeApi() { session='test'; }
  @override
  final cache = MemoryCache();
  Completer<void>? delay;
  final paths = <String>[];
  @override
  Future<Map<String, dynamic>> call(
    String path, [
    Map<String, dynamic>? data,
  ]) async {
    paths.add(path);
    if (delay != null) await delay!.future;
    if (path.startsWith('/api/options?resource=projects')) {
      return {
        'items': [
          {'id': 'north', 'name': 'North'},
        ],
        'next': null,
      };
    }
    if (path.startsWith('/api/v1/pages/dashboard'))
      return {'stats': {}, 'latest': []};
    if (path.startsWith('/api/v1/pages/requests'))
      return {'items': [], 'next': null};
    if (path.startsWith('/api/v1/pages/reports')) {
      return {
        'context': {'name': 'North'},
        'overview': {'request_count': 8, 'receipt_count': 4, 'materials': 1},
        'data': {
          'items': [
            {'id': 'm1', 'name': 'Steel', 'requested': '7'},
          ],
          'next': null,
        },
      };
    }
    if (path.startsWith('/api/v1/pages/technical')) {
      return {
        'items': [
          {'id': 'q1', 'number': 'PO-21', 'project_name': 'North', 'status': 1},
        ],
        'next': null,
      };
    }
    if (path == '/api/requests/q1') {
      return {
        'number': 'PO-21',
        'status': 1,
        'version': 3,
        'project_name': 'North',
        'actions': {},
        'lines': [
          {'material_name': 'Steel', 'quantity': '7', 'unit_name': 'kg'},
        ],
        'history': {'items': []},
      };
    }
    throw StateError('unexpected request');
  }
}

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'sessionExpiry':DateTime.now().add(const Duration(hours:1)).toIso8601String()});
  });
  Widget shell(FakeApi api, List<String> allowed) => MaterialApp(home: Overview(
    api:api, profile:{'name':'Employee One','permissions':[], 'navigation':[for(final k in allowed) {'key':k}]},
    arabic:false,queue:null,account:const Text('Profile'),
  ));
  Finder tab(String label) => find.descendant(of:find.byType(NavigationBar), matching:find.text(label));
  testWidgets('primary tabs retain project, search and cached data; only account hides its header', (tester) async {
    final api=FakeApi()..locale='en';
    await tester.pumpWidget(shell(api,['dashboard','requests','notifications','settings']));
    await tester.pumpAndSettle();
    expect(find.text('Employee'),findsOneWidget);
    final bell = find.byIcon(Icons.notifications_none_rounded);
    expect(tester.getCenter(bell).dx,lessThan(tester.getCenter(find.byIcon(Icons.account_circle_outlined)).dx));
    await tester.tap(find.text('All projects'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('North'));
    await tester.pumpAndSettle();
    await tester.tap(tab('Requests'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'saved search');
    await tester.tap(tab('Account'));
    await tester.pumpAndSettle();
    expect(find.byType(TrackHeader),findsNothing);
    expect(find.text('Profile'),findsOneWidget);
    await tester.tap(tab('Requests'));
    await tester.pumpAndSettle();
    expect(find.text('saved search'),findsOneWidget);
    expect(find.text('North'),findsOneWidget);
    expect(api.paths.where((path)=>path=='/api/v1/pages/requests?project=north'),hasLength(1));
    api.client.close();
  });
  testWidgets('department-only role has a home and can open its assigned section without a dashboard grant', (tester) async {
    final api=FakeApi()..locale='en';
    await tester.pumpWidget(shell(api,['technical','settings']));
    await tester.pumpAndSettle();
    expect(tab('Requests'),findsNothing);
    expect(find.text('Request statistics'),findsNothing);
    expect(find.text('Technical Office'),findsOneWidget);
    api.delay=Completer<void>();
    await tester.tap(find.text('Technical Office'));
    await tester.pump();
    expect(find.text('Hello'),findsOneWidget);
    expect(find.byType(CircularProgressIndicator),findsNothing);
    api.delay!.complete();
    await tester.pumpAndSettle();
    expect(find.text('PO-21'),findsOneWidget);
    expect(find.byType(NavigationBar),findsOneWidget);
    expect(api.paths,['/api/v1/pages/technical']);
    await tester.tap(tab('Account'));
    await tester.pumpAndSettle();
    expect(find.text('Profile'),findsOneWidget);
    api.client.close();
  });
  testWidgets('directory respects server navigation and unit access', (
    tester,
  ) async {
    String? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SectionDirectory(
            profile: {
              'navigation': [
                {'key': 'boq'},
                {'key': 'settings'},
              ],
              'canManageUnits': false,
            },
            arabic: true,
            open: (key) => selected = key,
          ),
        ),
      ),
    );
    expect(find.text('المواد'), findsOneWidget);
    expect(find.text('وحدات القياس'), findsNothing);
    expect(find.text('الحسابات'), findsNothing);
    await tester.tap(find.text('جدول الكميات'));
    expect(selected, 'boq');
  });
  testWidgets(
    'department queue and detail stay in Flutter with project context',
    (tester) async {
      final api = FakeApi()..locale = 'en';
      api.project.value = (id: 'north', name: 'North');
      await tester.pumpWidget(
        MaterialApp(
          home: SectionPage(api: api, section: 'technical'),
        ),
      );
      await tester.pumpAndSettle();
      expect(api.paths.single, '/api/v1/pages/technical?project=north');
      await tester.tap(find.text('PO-21'));
      await tester.pumpAndSettle();
      expect(api.paths.last, '/api/requests/q1');
      expect(find.text('Steel'), findsOneWidget);
      expect(find.text('Approve'), findsNothing);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Technical Office'), findsOneWidget);
      api.client.close();
    },
  );
  testWidgets('project report shows its native summary and consumption rows', (
    tester,
  ) async {
    final api = FakeApi()..locale = 'en';
    api.project.value = (id: 'north', name: 'North');
    await tester.pumpWidget(
      MaterialApp(
        home: SectionPage(api: api, section: 'reports'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('North'), findsNWidgets(2));
    expect(find.text('Requests  8'), findsOneWidget);
    expect(find.text('Steel'), findsOneWidget);
    api.client.close();
  });
}
