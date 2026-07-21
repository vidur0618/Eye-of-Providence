import { useEffect, useRef, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  digits?: number;
  prefix?: string;
  suffix?: string;
};

const format = (value: number, digits: number) => new Intl.NumberFormat("en-US", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(value);

export function AnimatedNumber({ value, digits = 0, prefix = "", suffix = "" }: AnimatedNumberProps) {
  const previous = useRef(value);
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const reducedFrame = requestAnimationFrame(() => {
        previous.current = value;
        setDisplayed(value);
      });
      return () => cancelAnimationFrame(reducedFrame);
    }
    const from = previous.current;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 520);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{prefix}{format(displayed, digits)}{suffix}</>;
}
