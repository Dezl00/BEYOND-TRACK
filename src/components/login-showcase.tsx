"use client";
import { useEffect, useState } from "react";
import { ar } from "@/messages/ar";
import LoginIllustration from "./login-illustrations";

export default function LoginShowcase() {
  const [active, setActive] = useState(0),
    [eligible, setEligible] = useState(false),
    [visible, setVisible] = useState(true),
    [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false);
  const slides = ar.loginStory.steps;
  useEffect(() => {
    const query = window.matchMedia(
      "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
    );
    const update = () => setEligible(query.matches);
    const visibility = () => setVisible(!document.hidden);
    update();
    visibility();
    query.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      query.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!eligible || !visible || hovered || focused) return;
    const timer = setInterval(
      () => setActive((value) => (value + 1) % slides.length),
      3000,
    );
    return () => clearInterval(timer);
  }, [active, eligible, visible, hovered, focused, slides.length]);
  function choose(next: number) {
    setActive((next + slides.length) % slides.length);
  }
  return (
    <aside
      className="login-showcase"
      role="region"
      aria-roledescription={ar.loginStory.carousel}
      aria-label={ar.loginStory.title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          choose(active + (event.key === "ArrowLeft" ? 1 : -1));
        }
      }}
    >
      <div className="login-slides">
        {slides.map((slide, index) => (
          <div
            key={slide.title}
            className="login-slide"
            data-active={active === index}
            aria-hidden={active !== index}
            inert={active !== index}
            role="group"
            aria-roledescription={ar.loginStory.slide}
            aria-label={slide.title}
          >
            <div className="login-art">
              <LoginIllustration scene={index as 0 | 1 | 2} />
            </div>
            <div className="login-slide-caption">
              <span className="login-step-number">
                <bdi>{index + 1}</bdi>
              </span>
              <h2>{slide.title}</h2>
              <p>{slide.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="login-carousel-controls">
        <div className="login-carousel-dots">
          {slides.map((slide, index) => (
            <button
              type="button"
              key={slide.title}
              aria-label={slide.title}
              aria-current={active === index ? "step" : undefined}
              onClick={() => choose(index)}
            >
              <span />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
