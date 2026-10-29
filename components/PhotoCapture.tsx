"use client";

/** Opens the rear camera (on phones) and returns a small JPEG data URL stamped with time. */
export function PhotoCapture({ value, onChange, id }: { value?: string; onChange: (dataUrl: string | undefined) => void; id: string }) {
  function handle(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 480 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const stamp = new Date().toLocaleString("en-PK");
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, c.height - 22, c.width, 22);
      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      ctx.fillText(stamp, 6, c.height - 7);
      URL.revokeObjectURL(url);
      onChange(c.toDataURL("image/jpeg", 0.7));
    };
    img.src = url;
  }
  return (
    <div className="row">
      {value ? (
        value === "seed" ? (
          <div style={{ width: 56, height: 56, borderRadius: 8, background: "#c9b79c", display: "grid", placeItems: "center", fontSize: 10 }}>Photo</div>
        ) : (
          <img src={value} alt="Doorstep photo" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
        )
      ) : null}
      <label htmlFor={id} className="btn sm" style={{ cursor: "pointer" }}>
        {value ? "Retake photo" : "Take photo"}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) handle(f);
        }}
      />
    </div>
  );
}

export function PhotoThumb({ src, size = 52 }: { src?: string; size?: number }) {
  if (!src) return <span className="xs muted">No photo</span>;
  if (src === "seed")
    return <div style={{ width: size, height: size, borderRadius: 8, background: "#c9b79c", display: "grid", placeItems: "center", fontSize: 10, color: "#4a3a24" }}>Photo</div>;
  return <img src={src} alt="Doorstep photo" style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", display: "block" }} />;
}
