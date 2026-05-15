import type { MetadataRoute } from "next";

const BASE = "https://sage-jury.vercel.app";

// v60.9.1 — 删除花哨 /sage/[id] /stock/[ticker] /about /dynamics /quotes 路由后，
// sitemap 只保留首页（chat 主入口）。
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
  ];
}
