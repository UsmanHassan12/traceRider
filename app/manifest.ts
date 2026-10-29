import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rider Trace",
    short_name: "Rider Trace",
    description: "Scan parcels, prove deliveries and returns, and track every handover.",
    start_url: "/rider",
    display: "standalone",
    background_color: "#f4f6f9",
    theme_color: "#a50505",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
