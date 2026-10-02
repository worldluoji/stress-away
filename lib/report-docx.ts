import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
} from "docx";

/** 把 raw markdown（来自 AI 的 reply）转成 .docx Blob。
 *  支持的语法：## / ### / - bullet / 1. / **bold** / 空行分段。
 *  不支持的：表格、图片、代码块——按正文段落处理（prompt 里没用这些）。 */
export async function markdownToDocxBlob(reply: string): Promise<Blob> {
  const children: Paragraph[] = [];
  for (const rawLine of reply.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.startsWith("### ")) {
      children.push(
        new Paragraph({
          text: line.slice(4),
          heading: HeadingLevel.HEADING_2,
        })
      );
    } else if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          text: line.slice(3),
          heading: HeadingLevel.HEADING_1,
        })
      );
    } else if (line.startsWith("- ")) {
      children.push(
        new Paragraph({
          children: parseInline(line.slice(2)),
          bullet: { level: 0 },
        })
      );
    } else if (/^\d+\.\s/.test(line)) {
      children.push(
        new Paragraph({
          children: parseInline(line.replace(/^\d+\.\s/, "")),
          numbering: { reference: "default-numbering", level: 0 },
        })
      );
    } else if (line.trim() === "") {
      children.push(new Paragraph({ text: "" }));
    } else {
      children.push(new Paragraph({ children: parseInline(line) }));
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}

/** 解析 **bold** 内联语法，返回 TextRun[] */
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
