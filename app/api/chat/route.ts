import { NextRequest, NextResponse } from "next/server";
import { chatWithAI, type ChatMessage } from "@/lib/models";
import { checkRateLimit, RATE_LIMITS, extractClientInfo } from "@/lib/ratelimit";

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
    }

    const reply = await chatWithAI(messages, scenarioId);

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