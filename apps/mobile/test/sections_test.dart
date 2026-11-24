import 'dart:async';
import 'package:beyond_track/api.dart';
import 'package:beyond_track/track_widgets.dart';
import 'package:beyond_track/page_cache.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:beyond_track/sections.dart';
import 'package:beyond_track/overview.dart';
import 'package:beyond_track/track_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

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
    if(path=='/api/commands' && data?['command']=='notification-read')return {};
    if(path.startsWith('/api/options?resource=boq')) {
      final level=Uri.parse(path).queryParameters['level']!;
      return {'items':[{'id':'filter-'+level,'name':'Branch '+level}],'next':null};
    }
    if (path.startsWith('/api/v1/pages/materials')) return {'items':[
      {'id':'steel','name':'Steel','code':'M1','quantity':'6.000','unit_name':'kg','active':true}], 'next':null};
    if (path.startsWith('/api/v1/pages/notifications')) return {'items':[], 'next':null};
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
    expect(tester.getCenter(bell).dx,lessThan(tester.getCenter(find.byIcon(Icons.person_rounded)).dx));
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
    expect(find.text('الإعدادات'), findsNothing);
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
  testWidgets('catalog rows, edit dialog, cascading filters and instant search', (tester) async {
    final api=FakeApi()..locale='en';
    await tester.pumpWidget(MaterialApp(home:SectionPage(api:api,section:'materials',profile:const {'permissions':['boq.edit','boq.create','boq.delete']})));
    await tester.pumpAndSettle();
    expect(find.byType(DataTable),findsOneWidget);
    expect(find.text('6'),findsOneWidget);
    await tester.tap(find.byTooltip('Edit'));
    await tester.pumpAndSettle();
    expect(find.byType(Dialog),findsOneWidget);
    await tester.tap(find.byType(CloseButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Filter'));
    await tester.pumpAndSettle();
    expect(find.text('Secondary section'),findsOneWidget);
    for(final (level,label) in [(1,'Main section'),(2,'Secondary section'),(3,'Subsection')]) {
      await tester.tap(find.text(label));await tester.pumpAndSettle();
      await tester.tap(find.text('Branch '+level.toString()));await tester.pumpAndSettle();
    }
    expect(api.paths.where((path)=>path.contains('level=3') && path.contains('seconds=filter-2')),isNotEmpty);
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField),'steel');
    await tester.pump(const Duration(milliseconds:220));
    await tester.pumpAndSettle();
    expect(api.paths.last,contains('q=steel'));
    expect(Uri.parse(api.paths.last).queryParameters,containsPair('leaves','filter-3'));
    api.client.close();
  });
  testWidgets('bell opens an anchored inbox and links to all notifications',(tester)async{
    final api=FakeApi()..locale='en';
    await tester.pumpWidget(shell(api,['requests','notifications']));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Notifications'));
    await tester.pumpAndSettle();
    expect(find.text('Mark all read'),findsOneWidget);
    await tester.tap(find.text('Mark all read'));await tester.pumpAndSettle();
    expect(api.paths,contains('/api/commands'));
    await tester.tap(find.text('View all notifications'));
    await tester.pumpAndSettle();
    expect(find.byType(SectionPage),findsOneWidget);
    api.client.close();
  });
  for(final ar in [true,false]) {
    testWidgets('narrow header and primary shortcuts follow '+(ar?'RTL':'LTR'),(tester)async{
      tester.view.devicePixelRatio=1;
      tester.view.physicalSize=const Size(320,680);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api=FakeApi()..locale=ar?'ar':'en';
      await tester.pumpWidget(MaterialApp(locale:Locale(api.locale),supportedLocales:const[Locale('ar'),Locale('en')],
        localizationsDelegates:GlobalMaterialLocalizations.delegates,
        home:Overview(api:api,profile:{'name':'Employee','permissions':[],'navigation':[for(final k in ['dashboard','requests','technical','notifications']){'key':k}]},
          arabic:ar,queue:null,account:const SizedBox())));
      await tester.pumpAndSettle();
      final bell=tester.getCenter(find.byIcon(Icons.notifications_none_rounded)).dx;
      final account=tester.getCenter(find.byIcon(Icons.person_rounded)).dx;
      expect(bell<account,!ar);
      final buttons=find.byType(FilledButton);
      expect(buttons,findsNWidgets(3));
      expect(tester.getTopLeft(buttons.first).dy,tester.getTopLeft(buttons.last).dy);
      expect(tester.takeException(),isNull);
      api.client.close();
    });
  }
  test('quantity formatting preserves fractional precision',(){
    expect(quantityText('6.000'),'6');
    expect(quantityText('0.015'),'0.015');
    expect(quantityText('600.200'),'600.2');
  });
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
