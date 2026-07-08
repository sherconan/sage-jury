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
  title: "交易对线 — 和投资大佬对线你的每一笔交易",
  description: "把你想买的票丢进来，和段永平、管我财正面对线。基于上万条雪球真实发言 + Wind 万得实时财务数据，看大佬会怎么判这笔交易。",
  keywords: ["交易对线", "价值投资", "段永平", "管我财", "交易决策", "股票分析", "雪球"],
  openGraph: {
    title: "交易对线",
    description: "和投资大佬正面对线你的每一笔交易，基于真实发言 + Wind 实时数据。",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "交易对线",
  "url": "https://sage-jury.vercel.app",
  "description": "和段永平、管我财正面对线你的每一笔交易，基于上万条雪球真实发言 + Wind 万得实时财务数据。",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "CNY" },
  "creator": {
    "@type": "Organization",
    "name": "交易对线",
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
