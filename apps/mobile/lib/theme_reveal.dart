import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// Keeps the live navigator in place while the previous frame recedes.
class ThemeReveal extends StatefulWidget {
  const ThemeReveal({super.key, required this.child});
  final Widget child;

  @override
  State<ThemeReveal> createState() => ThemeRevealState();
}

class ThemeRevealState extends State<ThemeReveal>
    with SingleTickerProviderStateMixin {
  final boundaryKey = GlobalKey();
  ui.Image? previous;
  late final clock =
      AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 320),
      )..addStatusListener((status) {
        if (status == AnimationStatus.completed) {
          setState(() {
            previous?.dispose();
            previous = null;
          });
        }
      });

  void start() {
    if (MediaQuery.disableAnimationsOf(context)) return;
    final boundary =
        boundaryKey.currentContext?.findRenderObject()
            as RenderRepaintBoundary?;
    if (boundary == null || !boundary.hasSize) return;
    var painted = true;
    assert(() {
      painted = !boundary.debugNeedsPaint;
      return true;
    }());
    if (!painted) return;
    final ui.Image snapshot;
    try {
      snapshot = boundary.toImageSync(
        pixelRatio: math.min(2.0, MediaQuery.devicePixelRatioOf(context)),
      );
    } on StateError {
      return;
    } on UnsupportedError {
      return;
    }
    setState(() {
      previous?.dispose();
      previous = snapshot;
    });
    clock.forward(from: 0);
  }

  @override
  void dispose() {
    clock.dispose();
    previous?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    key: boundaryKey,
    child: Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        if (previous case final image?)
          Positioned.fill(
            child: IgnorePointer(
              child: CustomPaint(painter: _RevealPainter(image, clock)),
            ),
          ),
      ],
    ),
  );
}

class _RevealPainter extends CustomPainter {
  _RevealPainter(this.image, this.clock) : super(repaint: clock);
  final ui.Image image;
  final Animation<double> clock;

  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;
    final radius =
        size.bottomRight(Offset.zero).distance *
        Curves.easeOutCubic.transform(clock.value);
    final mask = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(bounds)
      ..addOval(Rect.fromCircle(center: bounds.topRight, radius: radius));
    canvas.save();
    canvas.clipPath(mask);
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      bounds,
      Paint()..filterQuality = FilterQuality.low,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_RevealPainter old) =>
      old.image != image || old.clock != clock;
}
