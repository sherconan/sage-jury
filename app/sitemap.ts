import type { MetadataRoute } from "next";
import { SAGES } from "@/data/sages";

const BASE = "https://sage-jury.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/dynamics`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/quotes`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...SAGES.map((s) => ({
      url: `${BASE}/sage/${s.id}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
