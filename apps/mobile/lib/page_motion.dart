import 'package:flutter/material.dart';

class DirectionalPageMotion extends PageTransitionsBuilder {
  const DirectionalPageMotion();
  @override
  Duration get transitionDuration => const Duration(milliseconds: 205);
  @override
  Duration get reverseTransitionDuration => transitionDuration;

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final direction = Directionality.of(context);
    final curve = CurveTween(curve: Curves.easeOutCubic);
    return SlideTransition(
      textDirection: direction,
      position: animation
          .drive(curve)
          .drive(Tween(begin: const Offset(1, 0), end: Offset.zero)),
      child: SlideTransition(
        textDirection: direction,
        position: secondaryAnimation
            .drive(curve)
            .drive(Tween(begin: Offset.zero, end: const Offset(-1, 0))),
        child: child,
      ),
    );
  }
}
