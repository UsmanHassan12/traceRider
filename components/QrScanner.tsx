"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * Live camera QR scanner. Reads frames from the rear camera and decodes them with jsQR.
 * Needs HTTPS (or localhost) for camera access. Falls back to a photo upload when the
 * camera is blocked, which still works on most phones.
 */
export function QrScanner({ onResult, paused }: { onResult: (text: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    let last = "";
    let lastAt = 0;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera. Use Take photo of label below.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = video.current!;
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        await v.play();
        tick();
      } catch {
        setError("Camera permission was blocked. Allow camera access in the browser, or use Take photo of label.");
      }
    }

    function tick() {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState === v.HAVE_ENOUGH_DATA && !pausedRef.current) {
        if (!canvas.current) canvas.current = document.createElement("canvas");
        const c = canvas.current;
        const scale = Math.min(1, 640 / v.videoWidth);
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            const now = Date.now();
            if (code.data !== last || now - lastAt > 3000) {
              last = code.data;
              lastAt = now;
              if (navigator.vibrate) navigator.vibrate(60);
              cb.current(code.data.trim());
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }

    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch {
      /* torch not supported on this phone */
    }
  }

  async function fromPhoto(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const s = Math.min(1, 1400 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(d.data, d.width, d.height, { inversionAttempts: "attemptBoth" });
      if (code?.data) cb.current(code.data.trim());
      else setError("No QR code found in that photo. Hold the phone closer to the label and try again.");
    };
    img.src = url;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#0e1522", overflow: "hidden" }}>
      <video ref={video} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: error ? "none" : "block" }} />
      <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "45%", width: 240, height: 240, transform: "translate(-50%, -50%)" }}>
        {[
          { left: 0, top: 0, borderLeft: "4px solid #fff", borderTop: "4px solid #fff", borderRadius: "14px 0 0 0" },
          { right: 0, top: 0, borderRight: "4px solid #fff", borderTop: "4px solid #fff", borderRadius: "0 14px 0 0" },
          { left: 0, bottom: 0, borderLeft: "4px solid #fff", borderBottom: "4px solid #fff", borderRadius: "0 0 0 14px" },
          { right: 0, bottom: 0, borderRight: "4px solid #fff", borderBottom: "4px solid #fff", borderRadius: "0 0 14px 0" },
        ].map((s, i) => (
          <span key={i} style={{ position: "absolute", width: 38, height: 38, ...s }} />
        ))}
        {!error && <span className="scanline" style={{ position: "absolute", left: 12, right: 12, top: "50%", height: 3, borderRadius: 2, background: "#3fbf7f", boxShadow: "0 0 14px #3fbf7f" }} />}
      </div>
      {error && (
        <div style={{ position: "absolute", left: 20, right: 20, top: "62%", color: "#fff", textAlign: "center", fontSize: 13.5 }}>{error}</div>
      )}
      <div style={{ position: "absolute", right: 16, top: 16, display: "flex", gap: 8 }}>
        <button type="button" className="icon-btn" aria-label={torchOn ? "Turn torch off" : "Turn torch on"} onClick={toggleTorch} style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h10l-2 6v12H9V9z" /><path d="M12 13v2" /></svg>
        </button>
      </div>
      <label style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: "calc(45% + 140px)", color: "#c6ceda", fontSize: 13, textAlign: "center", cursor: "pointer", whiteSpace: "nowrap" }}>
        Camera not working? <u>Take photo of label</u>
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) fromPhoto(f); }} />
      </label>
    </div>
  );
}
