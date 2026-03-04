import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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

export async function extractWordsFromMedia(base64Data: string, mimeType: string): Promise<ExtractionResult> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Data.split(',')[1] || base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: "Extract all English words, their part of speech (pos, e.g., n., v., adj.), phonetic symbols (KK音標, wrapped in []), definitions (in Traditional Chinese), and example sentences with their Traditional Chinese translations. For each example sentence, also provide a mapping of English words/phrases to their corresponding Traditional Chinese translations as an array of segments. Ensure segments capture meaningful phrases or idioms if present. Return the data as a JSON object with keys: words (array of objects with word, pos, phonetic, definition, example, example_translation, example_segments) and suggestedCategory (string). Each segment in example_segments should have 'en' and 'zh' keys.",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          words: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                pos: { type: Type.STRING },
                phonetic: { type: Type.STRING },
                definition: { type: Type.STRING },
                example: { type: Type.STRING },
                example_translation: { type: Type.STRING },
                example_segments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      en: { type: Type.STRING },
                      zh: { type: Type.STRING },
                    },
                    required: ["en", "zh"],
                  },
                },
              },
              required: ["word", "pos", "phonetic", "definition", "example", "example_translation", "example_segments"],
            },
          },
          suggestedCategory: { type: Type.STRING },
        },
        required: ["words", "suggestedCategory"],
      },
    },
  });

  try {
    return JSON.parse(response.text || '{"words":[], "suggestedCategory":""}');
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { words: [], suggestedCategory: "" };
  }
}

export async function extractWordsFromText(text: string): Promise<ExtractionResult> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `Extract English words from the following text, providing their part of speech (pos, e.g., n., v., adj.), phonetic symbols (KK音標, wrapped in []), definitions (in Traditional Chinese), and example sentences with their Traditional Chinese translations. For each example sentence, also provide a mapping of English words/phrases to their corresponding Traditional Chinese translations as an array of segments. Ensure segments capture meaningful phrases or idioms if present. Return the data as a JSON object with keys: words (array of objects with word, pos, phonetic, definition, example, example_translation, example_segments) and suggestedCategory (string). Each segment in example_segments should have 'en' and 'zh' keys.

Text: ${text}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          words: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                pos: { type: Type.STRING },
                phonetic: { type: Type.STRING },
                definition: { type: Type.STRING },
                example: { type: Type.STRING },
                example_translation: { type: Type.STRING },
                example_segments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      en: { type: Type.STRING },
                      zh: { type: Type.STRING },
                    },
                    required: ["en", "zh"],
                  },
                },
              },
              required: ["word", "pos", "phonetic", "definition", "example", "example_translation", "example_segments"],
            },
          },
          suggestedCategory: { type: Type.STRING },
        },
        required: ["words", "suggestedCategory"],
      },
    },
  });

  try {
    return JSON.parse(response.text || '{"words":[], "suggestedCategory":""}');
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { words: [], suggestedCategory: "" };
  }
}

export async function evaluatePronunciation(audioBase64: string, targetWord: string): Promise<{ score: number, feedback: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: audioBase64,
              mimeType: "audio/webm",
            },
          },
          {
            text: `Evaluate the pronunciation of the word "${targetWord}" in the provided audio. 
            Return a JSON object with:
            - score: a number from 0 to 100 representing accuracy.
            - feedback: a short string in Traditional Chinese explaining how to improve or confirming it's correct.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
        },
        required: ["score", "feedback"],
      },
    },
  });

  try {
    return JSON.parse(response.text || '{"score":0, "feedback":"無法評估"}');
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
