import { describe, it, expect } from "vitest";
import { stripThinkTags } from "../lib/sanitize";

describe("stripThinkTags", () => {
  const cases: { desc: string; input: string; want: string }[] = [
    { desc: "无标签原样返回", input: "正文内容", want: "正文内容" },
    {
      desc: "开头 think 块被剥离",
      input: "<think>推理过程</think>\n正文",
      want: "正文",
    },
    {
      desc: "中段孤立  不吞掉前面正文（旧正则的 bug）",
      input: "重要结论放在前面  后续正文",
      want: "重要结论放在前面  后续正文",
    },
    {
      desc: "thinking 变体被剥离",
      input: "<thinking>深度思考</thinking>报告正文",
      want: "报告正文",
    },
    {
      desc: "think 与 thinking 混合各剥各的",
      input: "<think>a</think>正文<thinking>b</thinking>结尾",
      want: "正文结尾",
    },
    {
      desc: "大小写混排",
      input: "<THINK>推理</ThinK>正文",
      want: "正文",
    },
    {
      desc: "空输入返回空串",
      input: "",
      want: "",
    },
  ];

  cases.forEach((c) => {
    it(c.desc, () => {
      expect(stripThinkTags(c.input)).toBe(c.want);
    });
  });
});
