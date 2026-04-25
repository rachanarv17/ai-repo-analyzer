import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return [
    { url: base,              lastModified: new Date(), changeFrequency: "daily",   priority: 1.0 },
    { url: `${base}/history`, lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
    { url: `${base}/scan/9999`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];
}
