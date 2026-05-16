import { NextRequest, NextResponse } from "next/server";
import { chatWithAI, type ModelProvider, type ChatMessage } from "@/lib/models";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, model } = body as {
      messages: ChatMessage[];
      model: ModelProvider;
    };

    if (!messages || !model) {
      return NextResponse.json(
        { error: "Missing messages or model" },
        { status: 400 }
      );
    }

    const reply = await chatWithAI(messages, model);
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}