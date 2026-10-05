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
  PageNumber,
  PageBreak,
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

  // —— 封面页（section 1，独占整页） ——
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
    new Paragraph({ children: [new PageBreak()] }),
  ];

  // —— 正文（section 2） ——
  const lines = reply.split(/\r?\n/);
  const blocks = splitIntoBlocks(lines);
  const bodyChildren: (Paragraph | Table)[] = [];
  for (const block of blocks) {
    if (block.kind === "table") {
      bodyChildren.push(renderTable(block.lines));
    } else {
      for (const line of block.lines) {
        bodyChildren.push(renderLine(line));
      }
    }
  }

  const doc = new Document({
    creator: "反PUA手册",
    title: "维权方案报告",
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
        },
        children: coverChildren,
      },
      {
        properties: {
          page: { margin: { top: 1500, right: 1500, bottom: 1500, left: 1500 } },
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
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "第 ", font: CN_FONT, size: 18, color: "666666" }),
                  new TextRun({ children: [PageNumber.CURRENT], font: CN_FONT, size: 18, color: "666666" }),
                  new TextRun({ text: " 页 / 共 ", font: CN_FONT, size: 18, color: "666666" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: CN_FONT, size: 18, color: "666666" }),
                  new TextRun({ text: " 页", font: CN_FONT, size: 18, color: "666666" }),
                ],
              }),
            ],
          }),
        },
        children: bodyChildren,
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

function renderLine(line: string): Paragraph {
  if (line.startsWith("### ")) {
    return new Paragraph({
      children: parseInline(line.slice(4)),
      heading: HeadingLevel.HEADING_2,
    });
  }
  if (line.startsWith("## ")) {
    return new Paragraph({
      children: parseInline(line.slice(3)),
      heading: HeadingLevel.HEADING_1,
    });
  }
  if (line.startsWith("- ")) {
    return new Paragraph({
      children: parseInline(line.slice(2)),
      bullet: { level: 0 },
    });
  }
  if (/^\d+\.\s/.test(line)) {
    return new Paragraph({
      children: parseInline(line.replace(/^\d+\.\s/, "")),
      numbering: { reference: "default-numbering", level: 0 },
    });
  }
  return new Paragraph({ children: parseInline(line) });
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
                children: parseInline(cell).map((r) => new TextRun({ ...r, bold: true })),
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
                children: [new Paragraph({ children: parseInline(cell) })],
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

/** 解析 **bold** 内联语法，返回 TextRun[]（不带字体设置，由调用方覆盖）。 */
function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) runs.push(new TextRun({ text: text.slice(lastIdx, m.index) }));
    runs.push(new TextRun({ text: m[1], bold: true }));
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) runs.push(new TextRun({ text: text.slice(lastIdx) }));
  return runs.length > 0 ? runs : [new TextRun({ text })];
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