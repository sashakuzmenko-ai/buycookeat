import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cook & Eat",
    short_name: "Cook & Eat",
    description: "Меню, покупки і рецепти для сім'ї",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#2f7a40",
    lang: "uk",
  };
}
