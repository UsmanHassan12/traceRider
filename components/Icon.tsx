const PATHS = {
  box: ["M3 7l9-4 9 4v10l-9 4-9-4z", "M3 7l9 4 9-4M12 11v10"],
  scan: ["M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3", "M7 12h10"],
  home: ["M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  cash: ["M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z", "M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"],
  user: ["M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z", "M4 21a8 8 0 0 1 16 0"],
  phone: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  x: ["M6 6l12 12M18 6L6 18"],
  back: ["M15 5l-7 7 7 7"],
  chevron: ["M9 5l7 7-7 7"],
  alert: ["M12 7v6M12 17h.01"],
  info: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M12 8v5M12 16h.01"],
  qr: ["M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"],
  camera: ["M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z", "M12 10a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z"],
  nav: ["M3 11l18-8-8 18-2-8z"],
  pin: ["M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z", "M12 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"],
  grid: ["M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z"],
  map: ["M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z", "M9 4v14M15 6v14"],
  users: ["M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z", "M2.5 20a6.5 6.5 0 0 1 13 0M17 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"],
  flag: ["M5 21V4h11l-2 4 2 4H5"],
  printer: ["M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2", "M6 14h12v7H6z"],
  undo: ["M9 14L4 9l5-5", "M4 9h11a5 5 0 0 1 0 10h-3"],
  clock: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M12 7v5l3 2"],
  refresh: ["M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"],
  search: ["M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z", "M20 20l-4-4"],
  torch: ["M7 3h10l-2 6v12H9V9z", "M12 13v2"],
  logout: ["M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3", "M10 17l5-5-5-5M15 12H3"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 2, className, color }: { name: IconName; size?: number; stroke?: number; className?: string; color?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: "none" }}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
