import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { Dialog, Select } from "../src/components/ui";
import { number, pct, roleNames } from "../src/components/format";

const options = [
  { value: "1d", label: "1 天" },
  { value: "4h", label: "4 小时" },
];

describe("shared Binance-style UI contracts", () => {
  it("renders the selected combobox value with its accessible name", () => {
    const html = renderToStaticMarkup(
      createElement(Select, {
        label: "K 线周期",
        value: "4h",
        options,
        onChange: () => {},
      }),
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="K 线周期"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("4 小时");
    expect(html).not.toContain('role="listbox"');
  });
  it("keeps disabled controls native-disabled instead of only visually dimmed", () => {
    const html = renderToStaticMarkup(
      createElement(Select, {
        label: "周期",
        value: "1d",
        options,
        disabled: true,
        onChange: () => {},
      }),
    );
    expect(html).toContain('disabled=""');
  });
  it("renders a labelled native modal without leaking a global open attribute into SSR", () => {
    const html = renderToStaticMarkup(
      createElement(
        Dialog,
        {
          title: "设置",
          onClose: () => {},
        },
        "只读连接",
      ),
    );
    expect(html).toContain("<dialog");
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain('aria-label="关闭设置"');
    expect(html).not.toContain('open=""');
  });
  it("escapes untrusted tool or model text used as a UI label", () => {
    const html = renderToStaticMarkup(
      createElement(Select, {
        label: "模型",
        value: "x",
        options: [{ value: "x", label: "<script>alert(1)</script>" }],
        onChange: () => {},
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("retains stable numeric formatting and complete role labels", () => {
    expect(number(12345.678)).toBe("12,345.68");
    expect(pct(-0.0123)).toBe("-1.23%");
    expect(pct(0.0123)).toBe("+1.23%");
    expect(Object.keys(roleNames)).toHaveLength(8);
  });
  it("centralizes type sizes and avoids external font-loading requests", () => {
    const css = readFileSync(
      new URL("../src/app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).not.toMatch(/@import|fonts\.googleapis/);
    expect(css).toContain("font-variant-numeric: tabular-nums");
    expect(css.match(/--text-[a-z0-9]+:/g)).toHaveLength(7);
    expect(css).not.toMatch(/font-size:\s*\d/);
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
  it("loads the report and chart code only when an actual report is rendered", () => {
    const workbench = readFileSync(
      new URL("../src/components/workbench.tsx", import.meta.url),
      "utf8",
    );
    expect(workbench).not.toContain('from "recharts"');
    expect(workbench).toContain('import("./report")');
  });
});

function luminance(hex: string) {
  const channels = hex
    .replace("#", "")
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
describe("normal-size text contrast", () => {
  it.each([
    ["#eaecef", "#181a20"],
    ["#848e9c", "#181a20"],
    ["#848e9c", "#1e2329"],
    ["#181a20", "#fcd535"],
    ["#f0b90b", "#181a20"],
    ["#0ecb81", "#181a20"],
    ["#f6465d", "#181a20"],
    ["#5e6673", "#ffffff"],
    ["#8c6500", "#ffffff"],
  ])("%s on %s meets 4.5:1", (foreground, background) => {
    const levels = [luminance(foreground), luminance(background)].sort(
      (a, b) => b - a,
    );
    expect((levels[0] + 0.05) / (levels[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
