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
    const { texts, sourceLang, targetLang, sourceLangName, targetLangName, batch } = body;

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

    // Filter out empty texts and keep track of indices
    const nonEmptyTexts: { index: number; text: string }[] = [];
    texts.forEach((text, index) => {
      if (text && text.trim()) {
        nonEmptyTexts.push({ index, text });
      }
    });

    if (nonEmptyTexts.length === 0) {
      return NextResponse.json({ translations: texts });
    }

    // Build prompt for batch translation
    const prompt = `You are a professional translator. Translate the following ${nonEmptyTexts.length} texts from ${sourceLangName} to ${targetLangName}.

IMPORTANT RULES:
1. Maintain technical terminology and context
2. Keep the same tone and style
3. Return ONLY a JSON array with the translations in the EXACT same order
4. Each element in the array must correspond to the text at the same position
5. Do NOT add any explanation or additional text

Texts to translate (numbered for reference):
${nonEmptyTexts.map((item, i) => `[${i}] "${item.text}"`).join('\n')}

Return format: ["translation for text 0", "translation for text 1", ...]`;

    const response = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a professional technical translator. You MUST respond with ONLY a valid JSON array containing the translations in the exact same order as the input. No markdown, no explanation, just the JSON array.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '';

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
    } catch (parseError) {
      console.error('Failed to parse translation response:', content);
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

    return NextResponse.json({ translations: finalTranslations });

  } catch (error) {
    console.error('Translation API error:', error);
    return NextResponse.json(
      { error: 'Translation failed' },
      { status: 500 }
    );
  }
}
