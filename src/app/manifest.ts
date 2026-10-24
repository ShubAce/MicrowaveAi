import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "रसोई सखी",
    short_name: "सखी",
    description: "LG माइक्रोवेव के बारे में हिंदी में बोलकर पूछिए।",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eaf4dc",
    theme_color: "#eaf4dc",
    lang: "hi",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
