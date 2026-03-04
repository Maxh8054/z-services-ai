import { NextRequest, NextResponse } from 'next/server';

interface TranslateRequest {
  texts: string[];
  sourceLang: string;
  targetLang: string;
  sourceLangName: string;
  targetLangName: string;
}

// API Configuration - use environment variables
const getApiConfig = () => ({
  baseUrl: process.env.LLM_API_URL || process.env.ZAI_BASE_URL || '',
  apiKey: process.env.LLM_API_KEY || process.env.ZAI_API_KEY || '',
  chatId: process.env.LLM_CHAT_ID || process.env.ZAI_CHAT_ID || '',
  userId: process.env.LLM_USER_ID || process.env.ZAI_USER_ID || ''
});

export async function POST(request: NextRequest) {
  try {
    const body: TranslateRequest = await request.json();
    const { texts, sourceLang, targetLang, sourceLangName, targetLangName } = body;

    console.log('[Translate API] Request received:', {
      textsCount: texts?.length,
      sourceLang,
      targetLang,
      sourceLangName,
      targetLangName
    });

    // If same language, return originals
    if (sourceLang === targetLang) {
      return NextResponse.json({ translations: texts });
    }

    // Validate
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: 'No texts provided' }, { status: 400 });
    }

    // Get API config
    const config = getApiConfig();
    
    if (!config.baseUrl || !config.apiKey) {
      console.error('[Translate API] Missing API configuration');
      return NextResponse.json({ 
        error: 'API not configured', 
        details: 'Please set LLM_API_URL and LLM_API_KEY environment variables' 
      }, { status: 500 });
    }

    // Filter out empty texts and keep track of indices
    const nonEmptyTexts: { index: number; text: string }[] = [];
    texts.forEach((text, index) => {
      if (text && text.trim()) {
        nonEmptyTexts.push({ index, text });
      }
    });

    console.log('[Translate API] Non-empty texts to translate:', nonEmptyTexts.length);

    if (nonEmptyTexts.length === 0) {
      return NextResponse.json({ translations: texts });
    }

    // Build prompt for batch translation
    const textsList = nonEmptyTexts.map((item, i) => `[${i}] "${item.text}"`).join('\n');
    
    const systemPrompt = `You are a professional technical translator. You MUST respond with ONLY a valid JSON array containing the translations in the exact same order as the input. No markdown, no explanation, just the JSON array.`;

    const userPrompt = `Translate the following ${nonEmptyTexts.length} texts from ${sourceLangName} to ${targetLangName}.

IMPORTANT RULES:
1. Maintain technical terminology and context
2. Keep the same tone and style
3. Return ONLY a JSON array with the translations in the EXACT same order
4. Each element in the array must correspond to the text at the same position
5. Do NOT add any explanation or additional text

Texts to translate:
${textsList}

Return format: ["translation for text 0", "translation for text 1", ...]`;

    console.log('[Translate API] Sending request to LLM...');

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'X-Z-AI-From': 'Z'
    };

    if (config.chatId) {
      headers['X-Chat-Id'] = config.chatId;
    }
    if (config.userId) {
      headers['X-User-Id'] = config.userId;
    }

    // Make request directly
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        thinking: { type: 'disabled' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Translate API] LLM request failed:', response.status, errorText);
      return NextResponse.json({ 
        error: 'Translation API failed', 
        details: `Status ${response.status}: ${errorText}` 
      }, { status: 500 });
    }

    const completion = await response.json();
    const content = completion.choices?.[0]?.message?.content || '';
    console.log('[Translate API] LLM response:', content.substring(0, 200) + '...');

    // Parse JSON array from response
    let translations: string[] = [];

    try {
      // Try to extract JSON array from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        translations = JSON.parse(jsonMatch[0]);
      } else {
        translations = JSON.parse(content);
      }
      console.log('[Translate API] Parsed translations:', translations.length);
    } catch (parseError) {
      console.error('[Translate API] Failed to parse translation response:', content);
      return NextResponse.json({ translations: texts });
    }

    // Build final translations array with empty texts preserved
    const finalTranslations = [...texts];
    nonEmptyTexts.forEach((item, i) => {
      if (translations[i]) {
        finalTranslations[item.index] = translations[i];
      }
    });

    console.log('[Translate API] Final translations ready');
    return NextResponse.json({ translations: finalTranslations });

  } catch (error) {
    console.error('[Translate API] Error:', error);
    return NextResponse.json(
      { error: 'Translation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
