import { NextRequest, NextResponse } from "next/server";
import { chatWithAI, type ChatMessage } from "@/lib/models";
import { checkRateLimit, checkDeviceIdSpoofing, RATE_LIMITS, extractClientInfo } from "@/lib/ratelimit";
import { getAuthContext } from "@/lib/api-auth";
import { checkChatQuota, settleChat, checkUsage } from "@/lib/subscription";
import { CHAT_FREE_PER_DAY } from "@/lib/chat-quota";
import { incrementChatCount } from "@/lib/usage-events";
import { sanitizeMarkdown } from "@/lib/sanitize";

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: 与AI对话
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *               confirmPaid:
 *                 type: boolean
 *                 description: 免费额度用尽后，用户确认消耗1次购买额度
 *     responses:
 *       200:
 *         description: AI回复（quota 为最新额度状态）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *                 quota:
 *                   type: object
 *       400:
 *         description: 缺少必要参数
 *       402:
 *         description: 今日免费对话已用完，需 confirmPaid 确认后重发
 *       403:
 *         description: 未登录 / 未付费超免费额度 / 购买次数耗尽
 *       429:
 *         description: 请求过于频繁
 *       500:
 *         description: 服务器内部错误
 */
export async function POST(request: NextRequest) {
  try {
    const { deviceId } = extractClientInfo(request);
    const { ip } = extractClientInfo(request, deviceId);
    const config = RATE_LIMITS.chat;

    const rateLimitResult = await checkRateLimit(deviceId, ip, config);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limit_exceeded',
          message: '请求过于频繁，请稍后再试',
          resetAt: rateLimitResult.resetAt,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // Device ID anti-spoofing check
    const deviceIdCheck = await checkDeviceIdSpoofing(ip, deviceId);
    if (!deviceIdCheck.allowed) {
      return NextResponse.json(
        { error: 'device_id_rejected', message: '请求异常，已被拒绝' },
        { status: 403 }
      );
    }

    const auth = getAuthContext(request);

    // Parse body before quota decision (confirmPaid 参与决策)
    const body = await request.json();
    const { messages, scenarioId, confirmPaid } = body as {
      messages: ChatMessage[];
      scenarioId?: string;
      confirmPaid?: boolean;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    }

    // Validate messages: only allow 'user' and 'assistant' roles (prevent prompt injection)
    const MAX_MESSAGE_LENGTH = 4000;
    const MAX_USER_MESSAGE_LENGTH = 600;
    const MAX_MESSAGES = 50;

    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json({ error: "Messages count exceeds limit" }, { status: 400 });
    }

    for (const msg of messages) {
      if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
        return NextResponse.json({ error: "Invalid message role" }, { status: 400 });
      }
      if (typeof msg.content !== 'string' || msg.content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json({ error: "Invalid message content" }, { status: 400 });
      }
      if (msg.role === 'user' && msg.content.length > MAX_USER_MESSAGE_LENGTH) {
        return NextResponse.json({ error: "Message content exceeds 600 characters" }, { status: 400 });
      }
    }

    // Chat quota: 每日免费额度优先，超出后需用户确认才扣购买次数
    const quota = await checkChatQuota(auth.uid, confirmPaid === true);
    if (quota.action === 'need_confirm') {
      return NextResponse.json(
        {
          error: 'chat_quota_confirm',
          message: '今日免费对话已用完，继续对话将消耗 1 次购买额度（该额度用于生成维权报告）',
          freeUsed: quota.freeUsed,
          chatFreeLimit: CHAT_FREE_PER_DAY,
          paidRemaining: quota.paidRemaining,
        },
        { status: 402 }
      );
    }
    if (quota.action.startsWith('blocked_')) {
      const errorMap: Record<string, { code: string; message: string }> = {
        blocked_not_logged_in: { code: 'login_required', message: '请登录后使用' },
        blocked_not_paid: { code: 'free_exhausted', message: '今日免费对话已用完，激活码开通后可继续对话并生成维权报告' },
        blocked_paid_exhausted: { code: 'no_quota', message: '购买次数已用完，请绑定新的激活码' },
      };
      const err = errorMap[quota.action];
      return NextResponse.json({ error: err.code, message: err.message }, { status: 403 });
    }

    // Call AI first — only settle quota on success
    let rawReply: string;
    try {
      rawReply = await chatWithAI(messages, scenarioId);
    } catch (err) {
      // AI failed — do NOT consume quota
      return NextResponse.json({ error: "AI error" }, { status: 500 });
    }

    // Settle AFTER AI success. If settle fails, still return the AI reply to the user.
    // （chat 是免费引流场景，故意 silent-fail；report 是付费场景已返 settle_failed 区分处理）
    try {
      if (auth.uid) {
        await settleChat(auth.uid, quota.action);
      }
      incrementChatCount(scenarioId ?? 'general', auth.uid, deviceId);
    } catch (err) {
      console.error("[chat] settle failed (DB error), quota will self-heal on next /api/usage:", err);
    }

    const reply = sanitizeMarkdown(
      rawReply
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim()
    );

    const usage = await checkUsage(auth.uid);

    return NextResponse.json(
      { reply, quota: usage },
      {
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
        },
      }
    );
  } catch (error) {
    console.error("[chat] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}