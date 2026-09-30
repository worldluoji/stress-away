import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/lib/models";
import {
  computeCompensation,
  type CompInput,
  type DismissalType,
} from "@/lib/compensation";
import { checkRateLimit, checkDeviceIdSpoofing, RATE_LIMITS, extractClientInfo } from "@/lib/ratelimit";
import { getAuthContext } from "@/lib/api-auth";
import { checkUsage, consumeOne } from "@/lib/subscription";
import { incrementChatCount } from "@/lib/usage-events";
import { sanitizeMarkdown } from "@/lib/sanitize";

const MAX_NARRATIVE_LENGTH = 600;
const MAX_ANSWER_LENGTH = 200;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_DISMISSAL_TYPES: DismissalType[] = [
  "mutual",
  "no-fault-40",
  "illegal",
  "expired",
  "forced-resign",
];

const DISCLAIMER =
  "\n\n---\n*本报告由 AI 生成，不构成律师意见；赔偿金额为估算，实际以劳动仲裁委员会/法院认定为准。*";

function validateBody(body: unknown): { comp: CompInput; intakeAnswers: Record<string, string>; narrative: string } | string {
  if (typeof body !== "object" || body === null) return "请求体格式错误";
  const { comp, intakeAnswers, narrative } = body as {
    comp?: unknown;
    intakeAnswers?: unknown;
    narrative?: unknown;
  };

  if (typeof narrative !== "string" || narrative.trim().length === 0) {
    return "缺少事件经过描述";
  }
  if (narrative.length > MAX_NARRATIVE_LENGTH) {
    return `事件经过描述不能超过${MAX_NARRATIVE_LENGTH}字`;
  }
  if (typeof comp !== "object" || comp === null) return "缺少计算参数";

  const c = comp as Record<string, unknown>;
  if (typeof c.monthlyAvgWage !== "number" || !Number.isFinite(c.monthlyAvgWage) || c.monthlyAvgWage <= 0) {
    return "月平均工资无效";
  }
  if (c.lastMonthWage !== undefined && (typeof c.lastMonthWage !== "number" || !Number.isFinite(c.lastMonthWage) || c.lastMonthWage <= 0)) {
    return "上月工资无效";
  }
  if (typeof c.hiredAt !== "string" || !DATE_PATTERN.test(c.hiredAt) || isNaN(new Date(c.hiredAt).getTime())) {
    return "入职日期格式无效";
  }
  if (typeof c.firedAt !== "string" || !DATE_PATTERN.test(c.firedAt) || isNaN(new Date(c.firedAt).getTime())) {
    return "离职日期格式无效";
  }
  if (new Date(c.firedAt).getTime() < new Date(c.hiredAt).getTime()) {
    return "离职日期不能早于入职日期";
  }
  if (typeof c.city !== "string" || c.city.trim().length === 0 || c.city.length > 20) {
    return "城市无效";
  }
  if (!VALID_DISMISSAL_TYPES.includes(c.dismissalType as DismissalType)) {
    return "解除类型无效";
  }
  if (c.overtimeHours !== undefined) {
    const o = c.overtimeHours as Record<string, unknown>;
    for (const k of ["weekday", "weekend", "holiday"]) {
      const v = o?.[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 9999) {
        return `加班时长无效（${k}）`;
      }
    }
  }
  if (c.unusedAnnualLeaveDays !== undefined &&
      (typeof c.unusedAnnualLeaveDays !== "number" || !Number.isFinite(c.unusedAnnualLeaveDays) ||
       c.unusedAnnualLeaveDays < 0 || c.unusedAnnualLeaveDays > 99)) {
    return "未休年假天数无效";
  }

  const answers: Record<string, string> = {};
  if (intakeAnswers !== undefined) {
    if (typeof intakeAnswers !== "object" || intakeAnswers === null) return "基本情况格式错误";
    for (const [k, v] of Object.entries(intakeAnswers as Record<string, unknown>)) {
      if (typeof v !== "string" || v.length > MAX_ANSWER_LENGTH) {
        return `基本情况回答无效（${k}）`;
      }
      answers[k] = v;
    }
  }

  return {
    comp: c as unknown as CompInput,
    intakeAnswers: answers,
    narrative,
  };
}

/**
 * @swagger
 * /api/report:
 *   post:
 *     summary: 生成劳动维权方案报告（仅付费用户）
 *     tags: [Report]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - comp
 *               - narrative
 *             properties:
 *               comp:
 *                 type: object
 *               intakeAnswers:
 *                 type: object
 *               narrative:
 *                 type: string
 *     responses:
 *       200:
 *         description: 报告与计算明细
 *       403:
 *         description: 无配额或非付费用户
 *       429:
 *         description: 请求过于频繁
 */
export async function POST(request: NextRequest) {
  try {
    const { deviceId } = extractClientInfo(request);
    const { ip } = extractClientInfo(request, deviceId);
    const config = RATE_LIMITS.report;

    const rateLimitResult = await checkRateLimit(deviceId, ip, config);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: "rate_limit_exceeded",
          message: "请求过于频繁，请稍后再试",
          resetAt: rateLimitResult.resetAt,
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
            "Retry-After": Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const deviceIdCheck = await checkDeviceIdSpoofing(ip, deviceId);
    if (!deviceIdCheck.allowed) {
      return NextResponse.json(
        { error: "device_id_rejected", message: "请求异常，已被拒绝" },
        { status: 403 }
      );
    }

    const auth = getAuthContext(request);
    const usage = await checkUsage(auth.uid, deviceId);
    if (!usage.allowed || !usage.isPaid) {
      return NextResponse.json(
        {
          error: usage.allowed ? "paid_only" : "no_quota",
          message: usage.allowed
            ? "维权报告为付费功能，请使用激活码开通"
            : "次数已用完，请绑定新的激活码",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = validateBody(body);
    if (typeof parsed === "string") {
      return NextResponse.json({ error: "invalid_input", message: parsed }, { status: 400 });
    }
    const { comp, intakeAnswers, narrative } = parsed;

    // 服务端重算，防止前端篡改金额；金额明细随 prompt 注入
    const breakdown = computeCompensation(comp);

    let rawReply: string;
    try {
      rawReply = await generateReport(breakdown, intakeAnswers, narrative);
    } catch {
      return NextResponse.json({ error: "AI error" }, { status: 500 });
    }

    try {
      await consumeOne(auth.uid, deviceId);
      incrementChatCount("labor-report", auth.uid, deviceId);
    } catch {
      // 扣量失败不阻塞返回，与 chat 一致，下次检查时自校正
    }

    const reply = sanitizeMarkdown(
      rawReply
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim() + DISCLAIMER
    );

    return NextResponse.json(
      { reply, computation: breakdown },
      {
        headers: {
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
