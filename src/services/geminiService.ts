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
        required: ["word", "pos", "phonetic", "definition", "example", "example_translation", "example_segments"],
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
    model: "gemini-1.5-flash",
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

    const prompt = "Extract all English words, their part of speech (pos, e.g., n., v., adj.), phonetic symbols (KK音標, wrapped in []), definitions (in Traditional Chinese), and example sentences with their Traditional Chinese translations. For each example sentence, also provide a mapping of English words/phrases to their corresponding Traditional Chinese translations as an array of segments. Ensure segments capture meaningful phrases or idioms if present. Return the data as a JSON object with keys: words and suggestedCategory.";

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
    return JSON.parse(response.text() || '{"words":[], "suggestedCategory":""}');
  } catch (e) {
    console.error("Gemini Media Extraction Error:", e);
    return { words: [], suggestedCategory: "" };
  }
}

export async function extractWordsFromText(text: string, customApiKey?: string): Promise<ExtractionResult> {
  try {
    const model = getModel(customApiKey, extractionSchema);
    const prompt = `Extract English words from the following text, providing their part of speech(pos, e.g., n., v., adj.), phonetic symbols(KK音標, wrapped in []), definitions(in Traditional Chinese), and example sentences with their Traditional Chinese translations. For each example sentence, also provide a mapping of English words / phrases to their corresponding Traditional Chinese translations as an array of segments. Ensure segments capture meaningful phrases or idioms if present. Return the data as a JSON object with keys: words and suggestedCategory.

Text: ${text}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text() || '{"words":[], "suggestedCategory":""}');
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
