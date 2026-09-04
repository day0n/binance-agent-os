import type { Metadata } from "next";
import { AppProviders } from "@/components/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Binance Agent OS · Chat Agent",
  description:
    "多轮加密资产研究与小额现货执行助手。市场研究、现货体检、策略回测，以及需密码确认的现货与 USDT 划转。",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Binance Agent OS · Chat Agent",
    description: "多轮对话 · 真实行情 · 密码确认后的小额现货",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary",
    title: "Binance Agent OS · Chat Agent",
    description: "多轮对话 · 真实行情 · 密码确认后的小额现货",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
