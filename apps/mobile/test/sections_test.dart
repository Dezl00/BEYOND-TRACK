import 'package:beyond_track/api.dart';
import 'package:beyond_track/sections.dart';
import 'package:beyond_track/overview.dart';
import 'package:beyond_track/track_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeApi extends TrackApi {
  final paths = <String>[];
  @override
  Future<Map<String, dynamic>> call(
    String path, [
    Map<String, dynamic>? data,
  ]) async {
    paths.add(path);
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
  testWidgets(
    'primary tabs share the selected project and one navigation layout',
    (tester) async {
      final api = FakeApi()..locale = 'en';
      await tester.pumpWidget(
        MaterialApp(
          home: Overview(
            api: api,
            name: 'Employee',
            arabic: false,
            queue: null,
            canCreate: false,
            hasDashboard: true,
            openRequest: (_) {},
            account: const Text('Profile'),
            directory: (_) => const Text('Directory'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Employee'), findsOneWidget);
      await tester.tap(find.text('All projects'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('North'));
      await tester.pumpAndSettle();
      for (final tab in ['Requests', 'Sections', 'Account', 'Home']) {
        await tester.tap(
          find.descendant(
            of: find.byType(NavigationBar),
            matching: find.text(tab),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.getSize(find.byType(AppBar)).height, 72);
        expect(
          tester.widget<NavigationBar>(find.byType(NavigationBar)).height,
          64,
        );
        expect(find.text('North'), findsOneWidget);
        expect(
          tester.widget<TrackHeader>(find.byType(TrackHeader)).home,
          tab == 'Home',
        );
      }
      expect(api.paths, contains('/api/v1/pages/requests?project=north'));
      api.client.close();
    },
  );
  testWidgets(
    'limited roles retain the primary header and navigation on every tab',
    (tester) async {
      final api = FakeApi()..locale = 'en';
      await tester.pumpWidget(
        MaterialApp(
          home: Overview(
            api: api,
            name: 'User',
            arabic: false,
            queue: null,
            canCreate: false,
            hasDashboard: false,
            openRequest: (_) {},
            account: const Text('Account content'),
            directory: (open) =>
                TextButton(onPressed: open, child: const Text('Open settings')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TrackHeader>(find.byType(TrackHeader))
            .preferredSize
            .height,
        72,
      );
      expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).height,
        64,
      );
      await tester.tap(find.text('Open settings'));
      await tester.pumpAndSettle();
      expect(find.text('Account content'), findsOneWidget);
      expect(find.text('All projects'), findsOneWidget);
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(api.paths, isEmpty);
      api.client.close();
    },
  );
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
