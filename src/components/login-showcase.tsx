"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { ar } from "@/messages/ar";
import LoginIllustration from "./login-illustrations";

export default function LoginShowcase() {
  const [active, setActive] = useState(0),
    [playing, setPlaying] = useState(true),
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
    if (!playing || !eligible || !visible || hovered || focused) return;
    const timer = setInterval(
      () => setActive((value) => (value + 1) % slides.length),
      6500,
    );
    return () => clearInterval(timer);
  }, [playing, eligible, visible, hovered, focused, slides.length]);
  function choose(next: number) {
    setActive((next + slides.length) % slides.length);
    setPlaying(false);
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
                <bdi>{String(index + 1).padStart(2, "0")}</bdi>
                <span aria-hidden="true"> / </span>
                <bdi>{String(slides.length).padStart(2, "0")}</bdi>
              </span>
              <h2>{slide.title}</h2>
              <p>{slide.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="login-carousel-controls">
        <button
          type="button"
          className="login-carousel-arrow"
          aria-label={ar.common.previous}
          onClick={() => choose(active - 1)}
        >
          <ChevronRight size={17} />
        </button>
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
        <button
          type="button"
          className="login-carousel-arrow"
          aria-label={ar.common.next}
          onClick={() => choose(active + 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          type="button"
          className="login-carousel-play"
          disabled={!eligible}
          aria-label={
            playing && eligible ? ar.loginStory.pause : ar.loginStory.play
          }
          onClick={() => setPlaying((value) => !value)}
        >
          {playing && eligible ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>
    </aside>
  );
}
