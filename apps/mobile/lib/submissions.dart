import 'dart:async';
import 'package:flutter/foundation.dart';
import 'dart:convert';
import 'dart:math';
import 'package:sqflite/sqflite.dart';
import 'api.dart';

class SubmissionQueue extends ChangeNotifier {
  SubmissionQueue(this.api, this.user, this.session);
  final TrackApi api;
  final String user, session;
  late final Future<Database> db = openDatabase(
    'track-submissions.db',
    version: 1,
    onCreate: (db, _) => db.execute(
      'CREATE TABLE queue(id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL, issue TEXT)',
    ),
  );
  bool active = true, running = false;
  Future<void> submit(Map<String, dynamic> fields) async {
    final bytes = List.generate(16, (_) => Random.secure().nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes.map((n) => n.toRadixString(16).padLeft(2, '0')).join();
    final id =
        '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
    await (await db).insert('queue', {
      'id': id,
      'owner': user,
      'payload': jsonEncode({...fields, 'submit': true, 'submissionId': id}),
    });
    notifyListeners();
    unawaited(flush());
  }

  Future<List<Map<String, Object?>>> items() async => (await db).query(
    'queue',
    columns: ['id', 'issue'],
    where: 'owner=?',
    whereArgs: [user],
  );
  Future<void> discard(String id) async {
    await (await db).delete(
      'queue',
      where: 'owner=? AND id=? AND issue IS NOT NULL',
      whereArgs: [user, id],
    );
  }

  Future<void> flush() async {
    if (running || !active || api.session != session) return;
    running = true;
    try {
      final database = await db;
      final entries = await database.query(
        'queue',
        where: 'owner=? AND issue IS NULL',
        whereArgs: [user],
        orderBy: 'rowid',
      );
      for (final item in entries) {
        if (!active || api.session != session) return;
        try {
          await api.call('/api/commands', {
            'command': 'request',
            'data': jsonDecode(item['payload'] as String),
          });
          await database.delete(
            'queue',
            where: 'id=?',
            whereArgs: [item['id']],
          );
        } on ApiFailure catch (e) {
          if (e.status == 401 || e.status == 429 || e.status >= 500) return;
          await database.update(
            'queue',
            {'issue': e.message},
            where: 'id=?',
            whereArgs: [item['id']],
          );
        } catch (_) {
          return;
        }
      }
    } finally {
      running = false;
      if (active) notifyListeners();
    }
  }
}
