import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:sqflite/sqflite.dart';

class PageCache {
  late final Future<Database> _database = openDatabase(
    'track-pages.db',
    version: 1,
    onCreate: (db, _) => db.execute(
      'CREATE TABLE pages (scope TEXT, path TEXT, body TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(scope,path))',
    ),
  );
  String scope(String session) =>
      sha256.convert(utf8.encode(session)).toString();
  Future<void> save(
    String session,
    String path,
    Map<String, dynamic> body,
    DateTime expires,
  ) async {
    final db = await _database;
    await db.insert('pages', {
      'scope': scope(session),
      'path': path,
      'body': jsonEncode(body),
      'expires': expires.millisecondsSinceEpoch,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<Map<String, dynamic>?> read(String session, String path) async {
    final result = await (await _database).query(
      'pages',
      columns: ['body'],
      where: 'scope=? AND path=? AND expires>?',
      whereArgs: [scope(session), path, DateTime.now().millisecondsSinceEpoch],
      limit: 1,
    );
    if (result.isEmpty) return null;
    return jsonDecode(result.single['body'] as String) as Map<String, dynamic>;
  }

  Future<void> erase(String session) async {
    await (await _database).delete(
      'pages',
      where: 'scope=? OR expires<=?',
      whereArgs: [scope(session), DateTime.now().millisecondsSinceEpoch],
    );
  }
}
