import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  Header,
  Footer,
  SimpleField,
  LevelFormat,
} from "docx";

/** 封面元数据：生成日期（默认当前时刻）+ UID（可选）。 */
export interface ReportDocxOptions {
  generatedAt?: Date;
  uid?: string;
}

const CN_FONT = "微软雅黑";
const BRAND_BLUE = "2E5C8A";

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 把 AI 生成的 raw markdown 报告转成含封面/页眉/页脚的 .docx Blob。
 *  支持：封面页 + header + 页脚页码、## / ### / - bullet / 1. numbered / **bold**、
 *  管道表格（| col1 | col2 |）。
 *  不支持的：图片、代码块、内嵌 HTML（按正文段落处理，prompt 里不用这些）。 */
export async function markdownToDocxBlob(
  reply: string,
  opts?: ReportDocxOptions
): Promise<Blob> {
  const generatedAt = opts?.generatedAt ?? new Date();
  const dateStr = formatYMD(generatedAt);
  const uid = opts?.uid;

  // —— 封面页（page 1）+ 正文（page 2 起） ——
  // 单 section，封面内容在前几段；用"首个正文段落加 pageBreakBefore"切开（Mac Word
  // 对独立 PageBreak 段落有时报"unreadable content"，用 pageBreakBefore 更兼容）
  const coverChildren: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: "维权方案报告", font: CN_FONT, size: 44, bold: true, color: BRAND_BLUE })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 4000, after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `生成日期：${dateStr}`, font: CN_FONT, size: 24, color: "666666" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    ...(uid
      ? [
          new Paragraph({
            children: [new TextRun({ text: `UID：${uid}`, font: CN_FONT, size: 20, color: "999999" })],
            alignment: AlignmentType.CENTER,
          }),
        ]
      : []),
  ];

  // —— 正文 ——
  const lines = reply.split(/\r?\n/);
  const blocks = splitIntoBlocks(lines);
  const bodyChildren: (Paragraph | Table)[] = [];
  let firstBodyRendered = false;
  for (const block of blocks) {
    if (block.kind === "table") {
      bodyChildren.push(renderTable(block.lines));
    } else {
      for (const line of block.lines) {
        // 首个正文段落加 pageBreakBefore，强制从 page 2 开始
        bodyChildren.push(renderLine(line, !firstBodyRendered));
        firstBodyRendered = true;
      }
    }
  }

  const doc = new Document({
    creator: "反PUA手册",
    title: "维权方案报告",
    features: { updateFields: true },
    // 注册 "default-numbering" reference，否则 renderLine 里
    // numbering: { reference: "default-numbering" } 会被 docx 库字面输出为
    // <w:numId w:val="{default-numbering-0}"/>（非 ST_DecimalNumber，Mac Word 严格模式拒打开）
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              start: 1,
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          paragraph: {
            spacing: { line: 360, lineRule: "auto" },
          },
          run: { font: CN_FONT, size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1500, right: 1500, bottom: 1500, left: 1500 } },
          titlePage: true,
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "维权方案报告", font: CN_FONT, size: 18, color: "666666" }),
                  new TextRun({ text: "\t\t" }),
                  new TextRun({ text: dateStr, font: CN_FONT, size: 18, color: "666666" }),
                ],
              }),
            ],
          }),
          // titlePage=true 时 Mac Word 严格要求存在 first-page header/footer reference；
          // 封面页本身不需要页眉，给个空 Header 让 Word 渲染路径走通
          first: new Header({ children: [new Paragraph({ children: [] })] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "第 ", font: CN_FONT, size: 18, color: "666666" }),
                  // SimpleField 比 PageNumber 兼容性好：生成 <w:fldSimple> + cached value 文本，
                  // 部分 Word 版本对 begin/separate/end 之间无 cached run 的复杂字段会拒绝打开
                  new SimpleField("PAGE", "1"),
                  new TextRun({ text: " 页 / 共 ", font: CN_FONT, size: 18, color: "666666" }),
                  new SimpleField("NUMPAGES", "1"),
                  new TextRun({ text: " 页", font: CN_FONT, size: 18, color: "666666" }),
                ],
              }),
            ],
          }),
          // 同上：titlePage=true 要求 first-page footer reference 存在
          first: new Footer({ children: [new Paragraph({ children: [] })] }),
        },
        children: [...coverChildren, ...bodyChildren],
      },
    ],
  });

  return Packer.toBlob(doc);
}

// —— Markdown → 块（block-by-block；空行分段） ——

interface MarkdownBlock {
  kind: "paragraph" | "table";
  lines: string[];
}

function splitIntoBlocks(lines: string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    // 表格块：≥2 行、首行是 |xxx|、第二行是分隔行（|---|---| 或 |:---|---:|）
    const looksLikeTable =
      buf.length >= 2 &&
      /^\s*\|/.test(buf[0]) &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(buf[1]) &&
      /-/.test(buf[1]);
    blocks.push({ kind: looksLikeTable ? "table" : "paragraph", lines: buf });
    buf = [];
  };
  for (const line of lines) {
    if (line.trim() === "") flush();
    else buf.push(line);
  }
  flush();
  return blocks;
}

function renderLine(line: string, pageBreakBefore = false): Paragraph {
  const baseOpts = pageBreakBefore ? { pageBreakBefore: true } : {};
  if (line.startsWith("### ")) {
    return new Paragraph({
      ...baseOpts,
      children: toTextRuns(parseInline(line.slice(4))),
      heading: HeadingLevel.HEADING_2,
    });
  }
  if (line.startsWith("## ")) {
    return new Paragraph({
      ...baseOpts,
      children: toTextRuns(parseInline(line.slice(3))),
      heading: HeadingLevel.HEADING_1,
    });
  }
  if (line.startsWith("- ")) {
    return new Paragraph({
      ...baseOpts,
      children: toTextRuns(parseInline(line.slice(2))),
      bullet: { level: 0 },
    });
  }
  if (/^\d+\.\s/.test(line)) {
    return new Paragraph({
      ...baseOpts,
      children: toTextRuns(parseInline(line.replace(/^\d+\.\s/, ""))),
      numbering: { reference: "default-numbering", level: 0 },
    });
  }
  return new Paragraph({ ...baseOpts, children: toTextRuns(parseInline(line)) });
}

function renderTable(lines: string[]): Table {
  const parseRow = (line: string) =>
    line
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());

  // lines[0] = 表头，lines[1] = 分隔行，lines[2..] = 数据行
  const headerCells = parseRow(lines[0]);

  const dataRowObjects: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    if (!lines[i].includes("|")) continue; // 防御半成品
    dataRowObjects.push(parseRow(lines[i]));
  }

  const tableRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: headerCells.map(
        (cell) =>
          new TableCell({
            children: [
              new Paragraph({
                children: toTextRuns(parseInline(cell), { bold: true }),
              }),
            ],
            shading: { type: ShadingType.CLEAR, fill: "F5F5F5", color: "auto" },
          })
      ),
    }),
    ...dataRowObjects.map(
      (cells) =>
        new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                children: [new Paragraph({ children: toTextRuns(parseInline(cell)) })],
              })
          ),
        })
    ),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: "single", size: 4, color: "999999" },
      bottom: { style: "single", size: 4, color: "999999" },
      left: { style: "single", size: 4, color: "999999" },
      right: { style: "single", size: 4, color: "999999" },
      insideHorizontal: { style: "single", size: 4, color: "999999" },
      insideVertical: { style: "single", size: 4, color: "999999" },
    },
    rows: tableRows,
  });
}

/** 解析 **bold** 内联语法，返回 { text, bold } 纯数据。调用方各自包 TextRun。 */
interface InlineRun {
  text: string;
  bold: boolean;
}
function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) runs.push({ text: text.slice(lastIdx, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) runs.push({ text: text.slice(lastIdx), bold: false });
  return runs.length > 0 ? runs : [{ text, bold: false }];
}

function toTextRuns(inlines: InlineRun[], overrides: Partial<{ bold: boolean }> = {}): TextRun[] {
  return inlines.map((r) => new TextRun({ text: r.text, bold: r.bold || overrides.bold }));
}

/** 触发浏览器下载 */
export function triggerDocxDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}