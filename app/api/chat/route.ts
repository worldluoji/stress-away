import { NextRequest, NextResponse } from "next/server";
import { chatWithAI, type ChatMessage } from "@/lib/models";
import { checkRateLimit, checkDeviceIdSpoofing, RATE_LIMITS, extractClientInfo } from "@/lib/ratelimit";
import { getAuthContext } from "@/lib/api-auth";
import { checkUsage, consumeOne } from "@/lib/subscription";
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
 *     responses:
 *       200:
 *         description: AI回复
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *       400:
 *         description: 缺少必要参数
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

    // Check usage quota before processing chat
    const auth = getAuthContext(request);
    const usage = await checkUsage(auth.uid, deviceId);
    if (!usage.allowed) {
      return NextResponse.json(
        { error: 'no_quota', message: usage.isPaid ? '次数已用完，请升级' : '请登录后使用' },
        { status: 403 }
      );
    }

    // Consume quota BEFORE AI call — if this fails, reject rather than give free AI access
    let consumed = false;
    try {
      await consumeOne(auth.uid, deviceId);
      consumed = true;
    } catch (err) {
      console.error('[chat] consumeOne failed, rejecting request:', err);
      return NextResponse.json(
        { error: 'quota_error', message: '系统正忙，请稍后再试' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { messages, scenarioId } = body as { messages: ChatMessage[]; scenarioId?: string };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Missing messages" },
        { status: 400 }
      );
    }

    // Validate messages: only allow 'user' and 'assistant' roles (prevent prompt injection)
    const MAX_MESSAGE_LENGTH = 4000;
    const MAX_USER_MESSAGE_LENGTH = 600;
    const MAX_MESSAGES = 50;

    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json(
        { error: "Messages count exceeds limit" },
        { status: 400 }
      );
    }

    for (const msg of messages) {
      if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
        return NextResponse.json(
          { error: "Invalid message role" },
          { status: 400 }
        );
      }
      if (typeof msg.content !== 'string' || msg.content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: "Invalid message content" },
          { status: 400 }
        );
      }
      if (msg.role === 'user' && msg.content.length > MAX_USER_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: "Message content exceeds 600 characters" },
          { status: 400 }
        );
      }
    }

    const rawReply = await chatWithAI(messages, scenarioId);
    const reply = sanitizeMarkdown(
      rawReply
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .trim()
    );

    return NextResponse.json(
      { reply },
      {
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
        },
      }
    );
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}