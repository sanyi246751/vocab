import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
// Use a function or safe access to prevent crash if process is undefined in browser
export const getApiKey = () => {
  try {
    return (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : "") || "";
  } catch {
    return "";
  }
};

export interface ExampleSegment {
  en: string;
  zh: string;
}

export interface WordData {
  word: string;
  pos: string;
  phonetic: string;
  definition: string;
  example: string;
  example_translation: string;
  example_segments: ExampleSegment[];
}

export interface ExtractionResult {
  words: WordData[];
  suggestedCategory: string;
}

// Extraction Schema
const extractionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    words: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          word: { type: SchemaType.STRING },
          pos: { type: SchemaType.STRING },
          phonetic: { type: SchemaType.STRING },
          definition: { type: SchemaType.STRING },
          example: { type: SchemaType.STRING },
          example_translation: { type: SchemaType.STRING },
          example_segments: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                en: { type: SchemaType.STRING },
                zh: { type: SchemaType.STRING },
              },
              required: ["en", "zh"],
            },
          },
        },
      },
    },
    suggestedCategory: { type: SchemaType.STRING },
  },
  required: ["words", "suggestedCategory"],
};

// Pronunciation Schema
const pronunciationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    score: { type: SchemaType.NUMBER },
    feedback: { type: SchemaType.STRING },
  },
  required: ["score", "feedback"],
};

function getModel(customApiKey?: string, schema?: any) {
  const key = customApiKey || getApiKey();
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: schema ? {
      responseMimeType: "application/json",
      responseSchema: schema,
    } : undefined,
  });
}

export async function extractWordsFromMedia(base64WithHeader: string, mimeType: string, customApiKey?: string): Promise<ExtractionResult> {
  try {
    const base64Data = base64WithHeader.includes(',') ? base64WithHeader.split(',')[1] : base64WithHeader;
    const model = getModel(customApiKey, extractionSchema);

    const prompt = `你是一個溫柔的國小英文老師。請利用你的多模式理解能力，精準辨識並提取圖片中的英文單字。
如果圖片中只有單字而沒有詳細資訊（如音標、定義、例句），請你根據知識「自動補齊」這些內容。

方針：
1. 適合對象：國小學生。文字描述要簡單易懂。
2. 繁體中文：所有定義與翻譯請使用簡單的「繁體中文」。
3. 簡單例句：請編寫非常生活的簡單例句（例如：I have an apple.）。
4. 自動補齊：如果圖片只拍到單字，請務必自行提供詞性(pos)、KK音標(phonetic,置於[]中)、定義、例句及分段。

回傳格式必須是一個 JSON 物件，包含 'words' 陣列與 'suggestedCategory' 字串。`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
      { text: prompt },
    ]);

    const response = await result.response;
    const text = response.text();
    console.log("Gemini Media Raw Response:", text);

    // Clean JSON string if LLM includes markdown backticks
    const cleanJson = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleanJson || '{"words":[], "suggestedCategory":""}');
  } catch (e) {
    console.error("Gemini Media Extraction Error:", e);
    return { words: [], suggestedCategory: "" };
  }
}

export async function extractWordsFromText(text: string, customApiKey?: string): Promise<ExtractionResult> {
  try {
    const model = getModel(customApiKey, extractionSchema);
    const prompt = `你是一個溫柔的國小英文老師。請從以下文字中提取英文單字。
如果提供的內容只有單字，請「自動補齊」適合國小生程度的詞性、KK音標、繁體中文定義、簡單例句及其翻譯。

教學方針：
- 內容適合「國小學生」。
- 例句極簡且生活化。

文字內容：
${text}

回傳格式必須是 JSON 物件，包含 'words' 陣列與 'suggestedCategory' 字串。`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const resText = response.text();
    const cleanJson = resText.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleanJson || '{"words":[], "suggestedCategory":""}');
  } catch (e) {
    console.error("Gemini Text Extraction Error:", e);
    return { words: [], suggestedCategory: "" };
  }
}

export async function evaluatePronunciation(audioBase64: string, targetWord: string, customApiKey?: string): Promise<{ score: number, feedback: string }> {
  try {
    const model = getModel(customApiKey, pronunciationSchema);
    const prompt = `Evaluate the pronunciation of the word "${targetWord}" in the provided audio. 
Return a JSON object with:
- score: a number from 0 to 100 representing accuracy.
- feedback: a short string in Traditional Chinese explaining how to improve or confirming it's correct.`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: audioBase64,
          mimeType: "audio/webm",
        },
      },
      { text: prompt },
    ]);

    const response = await result.response;
    return JSON.parse(response.text() || '{"score":0, "feedback":"無法評估"}');
  } catch (e) {
    console.error("Failed to parse pronunciation evaluation", e);
    return { score: 0, feedback: "評估失敗" };
  }
}

/**
 * Uses the Web Speech API for reliable and fast pronunciation.
 */
export async function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}
