import { NextRequest, NextResponse } from 'next/server';

interface SpellCheckRequest {
  text: string;
  language: string; // 'pt', 'en', 'ja', 'zh'
}

interface SpellError {
  original: string;
  suggestions: string[];
  type: 'spelling' | 'grammar' | 'punctuation';
  message: string;
  position: number;
}

// API Configuration
const getApiConfig = () => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const llmKey = process.env.LLM_API_KEY;
  
  if (openaiKey) {
    return {
      baseUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      provider: 'openai' as const
    };
  } else if (llmKey) {
    return {
      baseUrl: process.env.LLM_API_URL || 'http://172.25.136.193:8080/v1',
      apiKey: llmKey,
      model: 'default',
      provider: 'zai' as const
    };
  }
  return null;
};

const languageNames: Record<string, string> = {
  pt: 'Portuguese',
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese'
};

export async function POST(request: NextRequest) {
  try {
    const body: SpellCheckRequest = await request.json();
    const { text, language = 'pt' } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ errors: [] });
    }

    const config = getApiConfig();
    if (!config) {
      return NextResponse.json({ errors: [], message: 'API not configured' });
    }

    const langName = languageNames[language] || 'Portuguese';

    const systemPrompt = `You are a professional ${langName} language proofreader. Analyze the given text for:
1. Spelling errors
2. Grammar errors (including verb agreement, tense, etc.)
3. Punctuation errors

Respond ONLY with a valid JSON array of errors found. If no errors, return empty array [].

Each error object must have:
- "original": the exact incorrect word/phrase from the text
- "suggestions": array of suggested corrections (max 3)
- "type": "spelling" | "grammar" | "punctuation"
- "message": brief explanation in ${langName}
- "position": character position where the error starts (0-based)

Important: 
- Only flag actual errors, not style preferences
- Be strict but fair
- For Japanese/Chinese, check for wrong characters and grammar particles`;

    const userPrompt = `Check this ${langName} text for errors:

"""
${text}
"""

Return JSON array of errors only. No markdown, no explanation outside JSON.`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    };

    let requestBody: Record<string, unknown>;

    if (config.provider === 'zai') {
      headers['X-Z-AI-From'] = 'Z';
      requestBody = {
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        thinking: { type: 'disabled' }
      };
    } else {
      requestBody = {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1
      };
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Spell Check API] Request failed:', response.status, errorText);
      return NextResponse.json({ errors: [] });
    }

    const completion = await response.json();
    const content = completion.choices?.[0]?.message?.content || '[]';

    // Parse JSON from response
    let errors: SpellError[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        errors = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('[Spell Check API] Parse error:', content);
    }

    return NextResponse.json({ errors });

  } catch (error) {
    console.error('[Spell Check API] Error:', error);
    return NextResponse.json({ errors: [] });
  }
}
