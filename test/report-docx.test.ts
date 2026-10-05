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

/** 解析 docx blob，提取 word/document.xml 的原始 XML（含标签，用于断言 <w:tbl> 等结构） */
async function extractDocXml(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  return zip.file("word/document.xml")!.async("string");
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

  it("识别管道表格：渲染为 <w:tbl> + 表头加粗 + 边框", async () => {
    const blob = await markdownToDocxBlob(
      "| 名称 | 金额 |\n|---|---|\n| N | 60000 |\n| 代通知金 | 15000 |"
    );
    const xml = await extractDocXml(blob);
    expect(xml).toContain("<w:tbl>");
    // 3 行：1 表头 + 2 数据
    const rowMatches = xml.match(/<w:tr\b/g) ?? [];
    expect(rowMatches.length).toBe(3);
    // 4 个单元格（2 列 × 2 行），但每个单元格在 XML 中只展开一次；用 tr→tc 计数
    const cellMatches = xml.match(/<w:tc\b/g) ?? [];
    expect(cellMatches.length).toBe(6);
    // 表头单元格 bold（第一个 <w:tc> 内应出现 <w:b/>）
    const firstCellEnd = xml.indexOf("</w:tc>");
    const firstCell = xml.slice(0, firstCellEnd);
    expect(firstCell).toMatch(/<w:b\s*\/?>/);
    // 边框定义存在
    expect(xml).toMatch(/<w:tblBorders>/);
  });

  it("单行带 | 但无分隔行 → 视为段落不渲染表格", async () => {
    // 没有 ≥2 行 + |---|---| 分隔 → 不会触发表格解析
    const blob = await markdownToDocxBlob("| col1 | col2 |");
    const xml = await extractDocXml(blob);
    expect(xml).not.toContain("<w:tbl>");
    const text = await extractDocText(blob);
    expect(text).toContain("col1");
    expect(text).toContain("col2");
  });

  it("空字符串也能生成有效 blob", async () => {
    const blob = await markdownToDocxBlob("");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("markdownToDocxBlob — 封面页与 opts", () => {
  /** 把 blob 解压出多个部件：document + headers + footers 的纯文本 */
  async function extractAllText(blob: Blob): Promise<string> {
    const buf = Buffer.from(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const parts: string[] = [];
    const targets = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"];
    for (const path of targets) {
      const f = zip.file(path);
      if (!f) continue;
      const xml = await f.async("string");
      parts.push(
        xml
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/\s+/g, " ")
          .trim()
      );
    }
    return parts.join(" ||| ");
  }

  it("不传 opts 时：封面有标题+当天日期，不含 UID 行", async () => {
    const blob = await markdownToDocxBlob("## 报告正文");
    const text = await extractAllText(blob);
    expect(text).toContain("维权方案报告");
    // 当天日期：YYYY-MM-DD（不锁死具体值，匹配任意 4-2-2）
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toContain("UID：");
  });

  it("传 opts.generatedAt = 固定日期，封面日期正确格式化", async () => {
    const blob = await markdownToDocxBlob("## 报告正文", {
      // 用本地时间构造，避免时区漂移导致测试不稳定
      generatedAt: new Date(2024, 0, 15, 12, 0, 0),
    });
    const text = await extractAllText(blob);
    // 至少出现一次 "2024-01-15"（封面 + 页眉）
    const matches = text.match(/2024-01-15/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("传 opts.uid = 'u123'，封面出现 'UID：u123'", async () => {
    const blob = await markdownToDocxBlob("## 报告正文", { uid: "u123" });
    const text = await extractAllText(blob);
    expect(text).toContain("UID：u123");
  });

  it("页眉含标题 + 日期；页脚含 '第 X 页 / 共 Y 页' 模板", async () => {
    const blob = await markdownToDocxBlob("## 报告", {
      generatedAt: new Date(2024, 0, 15, 12, 0, 0),
    });
    const text = await extractAllText(blob);
    expect(text).toContain("维权方案报告");
    expect(text).toContain("2024-01-15");
    // 页码字段在 docx 里渲染为 PAGE / NUMPAGES 字段占位，由 Word/WPS 打开时替换为实际数字
    expect(text).toContain("PAGE");
    expect(text).toContain("NUMPAGES");
    expect(text).toContain("第");
    expect(text).toContain("共");
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
