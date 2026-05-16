import { NextRequest, NextResponse } from "next/server";
import { chatWithAI, type ChatMessage } from "@/lib/models";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages } = body as { messages: ChatMessage[] };

    if (!messages) {
      return NextResponse.json(
        { error: "Missing messages" },
        { status: 400 }
      );
    }

    const reply = await chatWithAI(messages);
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}