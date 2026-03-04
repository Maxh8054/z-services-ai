import { NextRequest, NextResponse } from 'next/server';

interface SpellCheckRequest {
  text: string;
  preferredLanguage?: string; // The UI language - used as hint for detection
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
    const { text, preferredLanguage } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ errors: [], detectedLanguage: null });
    }

    const config = getApiConfig();
    if (!config) {
      return NextResponse.json({ errors: [], detectedLanguage: null, message: 'API not configured' });
    }

    const preferredLangName = preferredLanguage ? languageNames[preferredLanguage] : null;

    const systemPrompt = `You are a professional multilingual proofreader. 

${preferredLangName ? `IMPORTANT: The user's interface is in ${preferredLangName}. They are likely trying to write in ${preferredLangName}. Prioritize ${preferredLangName} corrections, even if a word looks like it could be from another language.` : 'Detect the language of the text first.'}

Analyze the text for errors:
1. Spelling errors
2. Grammar errors (including verb agreement, tense, etc.)
3. Punctuation errors

PORTUGUESE TECHNICAL WORDS - These are CORRECT words (do not flag as errors):
- caçamba (bucket/bed of truck)
- cilindro (cylinder)
- pistão (piston)
- válvula (valve)
- mangueira (hose)
- rolamento (bearing)
- vedação (seal)
- acoplamento (coupling)
- flange (flange)
- bucha (bushing)
- pinhão (pinion)
- engrenagem (gear)
- eixo (shaft)
- mancal (bearing housing)

COMMON PORTUGUESE MISSPELLINGS - Correct these:
- "casamba" → "caçamba" (NOT "cansamba"!)
- "cilindru" → "cilindro"
- "cilinder" → "cilindro" (when UI is Portuguese)
- "valvula" → "válvula"
- "mangueira" is correct, "manguera" is Spanish

CRITICAL RULES:
1. When the user types a phonetic approximation, think about what Portuguese word they MEANT
2. "casamba" sounds like "caçamba" - the user wants "caçamba"
3. NEVER suggest made-up words like "cansamba"
4. Always suggest the CORRECT Portuguese word that exists in the dictionary
5. Consider technical/industrial context - this is a maintenance report system

Respond ONLY with a valid JSON object:
{
  "detectedLanguage": "pt" | "en" | "ja" | "zh",
  "errors": [
    {
      "original": "incorrect word/phrase",
      "suggestions": ["correction1"],
      "type": "spelling" | "grammar" | "punctuation",
      "message": "explanation in the detected/preferred language",
      "position": 0
    }
  ]
}

Important rules:
- If the user's UI is in a specific language, they probably want to write in that language
- Check for phonetic misspellings (how the word sounds)
- ONLY suggest REAL words that exist in the dictionary
- Return the message in the SAME language as the user's preferred/detected language
- position is the 0-based character index where error starts`;

    const userPrompt = `Analyze this text and check for errors:
${preferredLangName ? `\nUser's UI language: ${preferredLangName} (prioritize corrections in this language)` : ''}

Text:
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
