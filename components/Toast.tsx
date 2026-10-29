"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tone = "plain" | "good" | "bad";
const Ctx = createContext<(msg: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; tone: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, tone: Tone = "plain") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 3400);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div key={toast.id} role="status" className={`toast ${toast.tone === "plain" ? "" : toast.tone}`}>
          {toast.msg}
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
