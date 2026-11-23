import 'package:beyond_track/main.dart';
import 'package:beyond_track/theme_reveal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'night surfaces are pure black and action colors retain their identity',
    () {
      final light = trackColors(false), dark = trackColors(true);
      expect([
        dark.surface,
        dark.surfaceContainer,
        dark.surfaceContainerHighest,
      ], everyElement(Colors.black));
      expect(dark.onSurface, Colors.white);
      expect(dark.primary, light.primary);
      expect(dark.primaryContainer, light.primaryContainer);
      expect(dark.error, light.error);
    },
  );

  testWidgets(
    'reveal changes the live screen immediately and releases its overlay',
    (tester) async {
      final key = GlobalKey<ThemeRevealState>();
      final dark = ValueNotifier(false);
      await tester.pumpWidget(
        MaterialApp(
          home: ThemeReveal(
            key: key,
            child: ValueListenableBuilder<bool>(
              valueListenable: dark,
              builder: (_, value, _) =>
                  ColoredBox(color: value ? Colors.black : Colors.white),
            ),
          ),
        ),
      );
      key.currentState!.start();
      dark.value = true;
      await tester.pump();
      expect(
        tester.widget<ColoredBox>(find.byType(ColoredBox).last).color,
        Colors.black,
      );
      expect(key.currentState!.previous, isNotNull);
      await tester.pump(const Duration(milliseconds: 321));
      expect(key.currentState!.previous, isNull);
      dark.dispose();
    },
  );
}
