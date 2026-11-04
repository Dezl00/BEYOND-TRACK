"use client";
import { useEffect, useRef, useState } from "react";
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  rollback: (value: T) => void,
) {
  const serialized = JSON.stringify(value),
    initial = useRef(serialized),
    saved = useRef(value),
    queue = useRef(Promise.resolve()),
    saveRef = useRef(save),
    rollbackRef = useRef(rollback);
  const [error, setError] = useState("");
  saveRef.current = save;
  rollbackRef.current = rollback;
  useEffect(() => {
    if (serialized === initial.current) return;
    const timer = setTimeout(() => {
      initial.current = serialized;
      queue.current = queue.current.then(async () => {
        try {
          await saveRef.current(value);
          saved.current = value;
          setError("");
        } catch (e) {
          setError((e as Error).message);
          if (initial.current === serialized) {
            initial.current = JSON.stringify(saved.current);
            rollbackRef.current(saved.current);
          }
        }
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [serialized]);
  return error;
}
