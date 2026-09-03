import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Binance Agent OS · 研究工作台",
  description:
    "基于 Binance 官方 MCP 的独立加密资产研究工作台。多 Agent 分析、现货账户体检与可复现策略回测。只读，不执行交易。",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Binance Agent OS · 研究工作台",
    description: "真实数据 · 多视角研究 · 独立风控",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary",
    title: "Binance Agent OS · 研究工作台",
    description: "真实数据 · 多视角研究 · 独立风控",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
