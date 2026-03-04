import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

interface TranslateRequest {
  texts: string[];
  sourceLang: string;
  targetLang: string;
  sourceLangName: string;
  targetLangName: string;
  batch?: boolean;
}

// Cache for ZAI instance
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

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

    // Initialize ZAI
    const zai = await getZAI();
    console.log('[Translate API] ZAI initialized');

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

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      thinking: { type: 'disabled' }
    });

    const content = completion.choices[0]?.message?.content || '';
    console.log('[Translate API] LLM response:', content.substring(0, 200) + '...');

    // Parse JSON array from response
    let translations: string[] = [];

    try {
      // Try to extract JSON array from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        translations = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: try to parse the whole response
        translations = JSON.parse(content);
      }
      console.log('[Translate API] Parsed translations:', translations.length);
    } catch (parseError) {
      console.error('[Translate API] Failed to parse translation response:', content);
      // Return original texts if parsing fails
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
