import { NextResponse } from "next/server";
import { type Issue } from "@/lib/api";

type FixRequest = {
  issue: Issue;
  fileContext: string; // the actual code snippet
  apiKey?: string;     // optional user API key to bypass system key
};

export async function POST(req: Request) {
  try {
    const body: FixRequest = await req.json();

    if (!body || !body.issue || !body.fileContext) {
      return NextResponse.json({ error: "Missing required payload variables." }, { status: 400 });
    }

    // In a real environment we would fire off a request to OpenAI / Google Gemini here.
    // For this demonstration, we'll build a very realistic dynamic "mocked" AST-generated fix return value!

    const simulatedLLMResponse = `Upon deeper inspection of line \`${body.issue.line_number}\`, the issue "\`${body.issue.message}\`" implies a structural vulnerability. I have rewritten the function block restricting unsafe calls and enforcing scoped constraints properly.`;

    const generatedAfterCode = `// 🤖 AI dynamically injected structural patch\n` + body.fileContext.replace(/unsafe/g, "safe").replace(/eval\(/g, "JSON.parse(");

    // Simulate LLM Network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    return NextResponse.json({
      ai_explanation: simulatedLLMResponse,
      suggested_fix: "Apply the generated patch block which removes the unsafe vector and restricts process inputs safely.",
      after_code: generatedAfterCode,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
