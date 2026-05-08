import type { Metadata } from "next";
import { Inter, Playfair_Display, Noto_Serif_SC, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });
const notoSerifSC = Noto_Serif_SC({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-noto-serif-sc",
  display: "swap",
  preload: false,
});
const notoSansSC = Noto_Sans_SC({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-noto-sans-sc",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sage-jury.vercel.app"),
  title: "大佬陪审团 · Sage Jury — 让投资大V替你审判每一笔交易",
  description: "段永平、冯柳、但斌、林园、张坤、巴菲特——6 位投资大佬的方法论给你的交易决策做结构化评分。一笔交易，六张评分卡，一份判决书。",
  keywords: ["价值投资", "段永平", "冯柳", "巴菲特", "投资陪审团", "交易决策", "股票分析"],
  openGraph: {
    title: "大佬陪审团 · Sage Jury",
    description: "用 6 位投资大V的方法论给交易决策做结构化评分。",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "大佬陪审团 · Sage Jury",
  "url": "https://sage-jury.vercel.app",
  "description": "用 6 位投资大V的方法论给交易决策做结构化评分。一笔交易，六张评分卡，一份判决书。",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "CNY" },
  "creator": {
    "@type": "Organization",
    "name": "Sage Jury Project",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${playfair.variable} ${notoSerifSC.variable} ${notoSansSC.variable}`}>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
