import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    const authResult = await verifyAuth(token);
    
    if (authResult === false || (typeof authResult === 'object' && !authResult.valid)) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const { messages } = await request.json();
    
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || typeof lastMessage.content !== "string") {
      return NextResponse.json(
        { error: "Invalid message format" },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    // Changed model name from gemini-1.5-flash-latest to gemini-1.5-pro (valid model)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const result = await model.generateContent(lastMessage.content);
    const response = await result.response;
    const text = await response.text();

    return NextResponse.json({ content: text });
  } catch (error: any) {
    console.error("Chat API error:", error);
    
    // More detailed error response
    const errorDetail = error.message || "Unknown error occurred";
    const debugInfo = {
      vercel: {
        onVercel: process.env.NEXT_PUBLIC_VERCEL_ENV ? true : false,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
        url: process.env.NEXT_PUBLIC_VERCEL_URL || "localhost",
        nodeEnv: process.env.NODE_ENV
      },
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(
      { 
        detail: `[GoogleGenerativeAI Error]: ${errorDetail}`,
        debug: debugInfo
      },
      { status: 500 }
    );
  }
}