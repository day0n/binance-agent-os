"use client";

import Link from "next/link";
import { Link2, Menu } from "lucide-react";
import { AccountMenu } from "@/components/auth/account-menu";

export function AppHeader({
  onMenu,
  onConnect,
}: {
  onMenu: () => void;
  onConnect: () => void;
}) {
  return (
    <header className="global-header">
      <button
        type="button"
        className="icon-button rail-toggle"
        aria-label="会话列表"
        onClick={onMenu}
      >
        <Menu size={18} />
      </button>
      <Link className="brand" href="/">
        Binance Agent OS
      </Link>
      <span className="independent-label">独立研究工具，非币安官方产品</span>
      <div className="header-actions">
        <button type="button" className="secondary-button connect-button" onClick={onConnect}>
          <Link2 size={14} />
          连接
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}
