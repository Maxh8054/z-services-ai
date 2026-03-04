import { NextRequest, NextResponse } from 'next/server';

interface SpellCheckRequest {
  text: string;
  language?: string; // Optional - will auto-detect if not provided
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

export async function POST(request: NextRequest) {
  try {
    const body: SpellCheckRequest = await request.json();
    const { text } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ errors: [], detectedLanguage: null });
    }

    const config = getApiConfig();
    if (!config) {
      return NextResponse.json({ errors: [], detectedLanguage: null, message: 'API not configured' });
    }

    const systemPrompt = `You are a professional multilingual proofreader. 

FIRST, detect the language of the text (Portuguese, English, Japanese, or Chinese).

THEN, analyze the text ONLY for errors in that detected language:
1. Spelling errors
2. Grammar errors (including verb agreement, tense, etc.)
3. Punctuation errors

Respond ONLY with a valid JSON object with this structure:
{
  "detectedLanguage": "pt" | "en" | "ja" | "zh",
  "errors": [
    {
      "original": "incorrect word/phrase",
      "suggestions": ["correction1", "correction2"],
      "type": "spelling" | "grammar" | "punctuation",
      "message": "explanation in the detected language",
      "position": 0
    }
  ]
}

Important rules:
- Detect language FIRST before checking for errors
- If text is Portuguese, check Portuguese spelling/grammar ONLY
- If text is English, check English spelling/grammar ONLY
- If text is Japanese, check Japanese grammar/kanji ONLY
- If text is Chinese, check Chinese grammar/characters ONLY
- Only flag actual errors, not style preferences
- Return the message in the SAME language as the detected text
- position is the 0-based character index where error starts`;

    const userPrompt = `Analyze this text, detect its language, and check for errors:

"""
${text}
"""

Return JSON only. No markdown, no explanation outside JSON.`;

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
      return NextResponse.json({ errors: [], detectedLanguage: null });
    }

    const completion = await response.json();
    const content = completion.choices?.[0]?.message?.content || '{}';

    // Parse JSON from response
    let errors: SpellError[] = [];
    let detectedLanguage: string | null = null;
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        errors = parsed.errors || [];
        detectedLanguage = parsed.detectedLanguage || null;
      }
    } catch (parseError) {
      console.error('[Spell Check API] Parse error:', content);
    }

    return NextResponse.json({ errors, detectedLanguage });

  } catch (error) {
    console.error('[Spell Check API] Error:', error);
    return NextResponse.json({ errors: [], detectedLanguage: null });
  }
}
