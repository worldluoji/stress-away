import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import JSZip from "jszip";
import { markdownToDocxBlob, triggerDocxDownload } from "../lib/report-docx";

/** 解析 docx blob，提取 word/document.xml 的纯文本（去 XML 标签） */
async function extractDocText(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

describe("markdownToDocxBlob — markdown 语法映射", () => {
  const cases: { desc: string; input: string; mustContain: string[] }[] = [
    {
      desc: "## 渲染为 Heading1",
      input: "## 标题一\n正文",
      mustContain: ["标题一", "正文"],
    },
    {
      desc: "### 渲染为 Heading2",
      input: "### 子标题\n详情",
      mustContain: ["子标题", "详情"],
    },
    {
      desc: "- bullet 保留文本",
      input: "- 第一项\n- 第二项",
      mustContain: ["第一项", "第二项"],
    },
    {
      desc: "1. 编号列表保留文本",
      input: "1. 第一步\n2. 第二步",
      mustContain: ["第一步", "第二步"],
    },
    {
      desc: "**bold** 提取为粗体内联",
      input: "这是 **关键** 一句",
      mustContain: ["这是", "关键", "一句"],
    },
    {
      desc: "空行作为段落分隔",
      input: "第一段\n\n第二段",
      mustContain: ["第一段", "第二段"],
    },
    {
      desc: "完整五段式报告都能解析",
      input:
        "## 一、赔偿明细核对\n你的 N = 60000 元\n\n" +
        "## 二、证据清单\n- 劳动合同\n- 工资流水\n\n" +
        "## 三、仲裁流程与时间线\n1. 立案\n2. 调解\n\n" +
        "## 四、仲裁申请书草稿\n申请人张三\n\n" +
        "## 五、风险与谈判策略\n建议优先协商",
      mustContain: [
        "一、赔偿明细核对",
        "二、证据清单",
        "三、仲裁流程与时间线",
        "四、仲裁申请书草稿",
        "五、风险与谈判策略",
        "60000",
        "劳动合同",
        "工资流水",
        "立案",
        "调解",
        "申请人张三",
        "建议优先协商",
      ],
    },
  ];

  cases.forEach((c) => {
    it(c.desc, async () => {
      const blob = await markdownToDocxBlob(c.input);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
      expect(blob.type).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      const text = await extractDocText(blob);
      for (const s of c.mustContain) {
        expect(text).toContain(s);
      }
    });
  });

  it("不识别表格（按正文段落处理，不报错）", async () => {
    const blob = await markdownToDocxBlob("| col1 | col2 |\n|---|---|\n| a | b |");
    const text = await extractDocText(blob);
    expect(text).toContain("col1");
    expect(text).toContain("a");
  });

  it("空字符串也能生成有效 blob", async () => {
    const blob = await markdownToDocxBlob("");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("triggerDocxDownload — 浏览器下载触发", () => {
  let createdUrl: string | null = null;
  let revokedUrl: string | null = null;
  let clickedDownload: string | null = null;
  let clickedHref: string | null = null;
  let appendedTags: string[] = [];
  let removedTags: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    createdUrl = null;
    revokedUrl = null;
    clickedDownload = null;
    clickedHref = null;
    appendedTags = [];
    removedTags = [];

    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: () => {
          createdUrl = "blob:mock-url";
          return createdUrl;
        },
        revokeObjectURL: (url: string) => {
          revokedUrl = url;
        },
      })
    );

    const fakeAnchor: Record<string, unknown> = { tag: "a" };
    Object.defineProperty(fakeAnchor, "href", {
      get: () => clickedHref,
      set: (v: string) => {
        clickedHref = v;
      },
      configurable: true,
    });
    Object.defineProperty(fakeAnchor, "download", {
      get: () => clickedDownload,
      set: (v: string) => {
        clickedDownload = v;
      },
      configurable: true,
    });
    fakeAnchor.click = () => {};

    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "a") return fakeAnchor;
        return { tag };
      },
      body: {
        appendChild: (el: { tag?: string }) => appendedTags.push(el.tag ?? "?"),
        removeChild: (el: { tag?: string }) => removedTags.push(el.tag ?? "?"),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("调用 createObjectURL → 设置 href/download → click → revokeObjectURL", () => {
    const blob = new Blob(["x"], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    triggerDocxDownload(blob, "report");
    expect(createdUrl).toBe("blob:mock-url");
    expect(clickedHref).toBe("blob:mock-url");
    expect(clickedDownload).toBe("report.docx");
    expect(appendedTags).toEqual(["a"]);
    expect(removedTags).toEqual(["a"]);
    vi.advanceTimersByTime(1000);
    expect(revokedUrl).toBe("blob:mock-url");
  });

  it("filename 已含 .docx 后缀时不重复拼接", () => {
    const blob = new Blob(["x"]);
    triggerDocxDownload(blob, "report.docx");
    expect(clickedDownload).toBe("report.docx");
  });
});
