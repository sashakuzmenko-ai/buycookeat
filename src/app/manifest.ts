import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cook & Eat",
    short_name: "Cook & Eat",
    description: "Меню, покупки і рецепти для сім'ї",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F5F1",
    theme_color: "#1E6B45",
    lang: "uk",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
