import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import {
  remarkPlugins,
  markdownComponents,
  disallowedElements,
} from "@/app/components/markdown";

function render(md: string): string {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins,
      components: markdownComponents,
      disallowedElements,
    }, md),
  );
}

describe("网页端 markdown 渲染 — 共享配置", () => {
  const cases: {
    desc: string;
    input: string;
    mustContain: string[];
    mustNotContain?: string[];
  }[] = [
    {
      desc: "GFM 管道符表格渲染为 <table>",
      input:
        "| 证据名称 | 证据内容 |\n|---|---|\n| 劳动合同 | 期限、岗位、工资标准 |",
      mustContain: ["<table", "<th", "证据名称", "<td", "劳动合同"],
    },
    {
      desc: "表格带横向滚动容器与边框样式",
      input: "| A | B |\n|---|---|\n| 1 | 2 |",
      mustContain: ["overflow-x-auto", "border-collapse"],
    },
    {
      desc: "段落与表格混排",
      input:
        "## 证据清单\n\n先准备以下材料：\n\n| A | B |\n|---|---|\n| 1 | 2 |",
      mustContain: ["<h2", "<p", "<table"],
    },
    {
      desc: "既有语法回归：标题/列表/加粗/引用",
      input: "## 标题\n\n- 项目一\n- 项目二\n\n**重点**\n\n> 引用",
      mustContain: ["<h2", "<li", "<strong", "<blockquote"],
    },
    {
      desc: "XSS：原始 script 不生成可执行标签（react-markdown 转义为文本）",
      input: "<script>alert(1)</script>\n\nsafe",
      mustContain: ["safe"],
      mustNotContain: ["<script", "<SCRIPT"],
    },
  ];

  for (const { desc, input, mustContain, mustNotContain } of cases) {
    it(desc, () => {
      const html = render(input);
      for (const needle of mustContain) {
        expect(html).toContain(needle);
      }
      for (const needle of mustNotContain ?? []) {
        expect(html).not.toContain(needle);
      }
    });
  }
});
