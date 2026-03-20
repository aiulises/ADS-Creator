import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { SelfieQualityReport } from "./types";

// Helper to get a fresh client instance, ensuring we use the latest API key from the environment.
const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY! });
};

// FIX: Add a helper function to convert a base64 image to a generative part.
const fileToGenerativePart = (base64: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64,
      mimeType,
    },
  };
};

// Helper to parse potential JSON error messages from Gemini and provide user-friendly feedback.
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    // The error message from the Gemini SDK might be a JSON string.
    try {
      // Attempt to parse it.
      const parsedError = JSON.parse(error.message);
      if (parsedError.error && parsedError.error.message) {
        let friendlyMessage = parsedError.error.message;
        // Provide specific advice for common, actionable errors.
        if (parsedError.error.status === 'RESOURCE_EXHAUSTED') {
          friendlyMessage = 'You have exceeded your API quota. Please check your plan and billing details with Google AI Studio.';
        }
        return friendlyMessage;
      }
    } catch (e) {
      // If parsing fails, it's not a JSON string, so we fall through
      // and return the original error message.
    }
    return error.message;
  }
  return String(error);
};

export const analyzeSelfieQuality = async (base64Image: string, mimeType: string): Promise<SelfieQualityReport> => {
  const model = 'gemini-2.5-flash';
  const prompt = `Act as an AI Art Director. Analyze this selfie for its suitability in creating a photorealistic digital twin. Your response MUST be in JSON format. Evaluate the following criteria:
1.  **Clarity & Focus:** Is the face sharp and in focus?
2.  **Lighting:** Is the face well-lit with soft, even lighting? Avoid harsh shadows or overexposure.
3.  **Pose & Obstruction:** Is the face clearly visible, forward-facing, and unobstructed by hands, hair, or objects?

Based on your analysis, provide a JSON object with the following structure:
- \`isUsable\`: A boolean. \`true\` if the image is good enough, \`false\` otherwise.
- \`score\`: A number from 0 (unusable) to 10 (perfect).
- \`feedback\`: An array of short, actionable strings for the user to improve their photo. If the score is high, the feedback can be positive.`;

  const imagePart = fileToGenerativePart(base64Image, mimeType);

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }, imagePart] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isUsable: { type: Type.BOOLEAN },
            score: { type: Type.INTEGER },
            feedback: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as SelfieQualityReport;
  } catch (error) {
    console.error("Selfie quality analysis failed:", error);
    // Return a default error report if the API call fails
    return {
      isUsable: false,
      score: 0,
      feedback: [`Could not analyze the selfie: ${getErrorMessage(error)}`],
    };
  }
};


export const analyzeImage = async (base64Image: string, mimeType: string, type: 'selfie' | 'product'): Promise<string> => {
  const model = 'gemini-2.5-flash';
  const prompt =
    type === 'selfie'
      ? `Analyze the person in this selfie and generate a definitive 'character sheet' for a photorealistic AI twin. This description MUST be precise and detailed enough to be reused perfectly across multiple images. Focus on capturing the unique essence of their facial features to ensure a strong likeness. Capture the following immutable characteristics:
- **Identity:** Gender, estimated age, ethnicity.
- **Physique:** Body type (e.g., athletic, slim, curvy), approximate height if discernible.
- **Facial Features:** Face shape, eye color and shape, nose shape, lip shape, skin tone and texture (e.g., freckles).
- **Hair:** Exact color, style (e.g., long wavy, short buzz cut), texture, and length.
- **Distinctive Marks:** Meticulously describe any visible tattoos (location, design), scars, piercings, or birthmarks.
The output should be a factual, descriptive paragraph. This is critical for maintaining character consistency and achieving a recognizable likeness.`
      : `Analyze this product image for an AI ad generator. 
CRITICAL REQUIREMENT: 100% VISUAL FIDELITY.
You must transcribe every single word of text on the product label EXACTLY as it appears.
- **TEXT & LOGOS (HIGHEST PRIORITY):** Read and list EVERY word found on the packaging. Describe the font style (serif, sans-serif, handwritten), font weight, and text color.
- **COLORS:** Describe the exact shades (e.g., "matte obsidian black", "neon electric blue").
- **SHAPE & MATERIALS:** Describe the bottle/box shape, material (glass, plastic, cardboard), and surface finish (glossy, matte, metallic).
- **OUTPUT:** A precise, forensic description used to reconstruct this object perfectly in a generated image.`;

  const imagePart = fileToGenerativePart(base64Image, mimeType);
  
  // FIX: Add try-catch block for robust error handling.
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }, imagePart] }],
    });
    return response.text;
  } catch (error) {
    throw new Error(`Failed to analyze ${type} image: ${getErrorMessage(error)}`);
  }
};

export const generateAdImage = async (prompt: string, referenceImages: { data: string, mimeType: string }[], seed: number): Promise<string> => {
  // Upgraded to gemini-3-pro-image-preview for high quality (8k realism)
  const model = 'gemini-3-pro-image-preview';
  
  try {
    const ai = getAiClient();
    
    // Construct the parts array. We put the text prompt first, then the reference images.
    const parts: any[] = [{ text: prompt }];
    
    referenceImages.forEach(img => {
        parts.push({
            inlineData: {
                data: img.data,
                mimeType: img.mimeType
            }
        });
    });

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
          seed,
          // Explicit image configuration for high quality
          imageConfig: {
              imageSize: '2K', // Supports 1K, 2K, 4K
          }
      },
    });

    // More robust check to prevent crashes on blocked or empty responses.
    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      if (candidate?.finishReason === 'SAFETY') {
        throw new Error("Generation was blocked by the safety filter. Please try adjusting your prompt or uploaded images.");
      }
      throw new Error("The API returned an empty or invalid response.");
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    
    throw new Error("No image data found in the API response.");
  } catch (error) {
     throw new Error(`Image generation failed: ${getErrorMessage(error)}`);
  }
};

export const generateAdCaption = async (personaName: string, platformName: string, productList: string, brandVoice: string): Promise<string> => {
  const model = 'gemini-2.5-flash';
  const prompt = `Generate a short, punchy ad caption for ${platformName}.
Ad Persona: ${personaName}
Products: ${productList}

**Brand Voice (Adhere Strictly):** ${brandVoice}

The caption must be catchy, include relevant hashtags, and have a clear call to action. Do not include the word "caption" or quotation marks in the output.`;
  
  // FIX: Add try-catch block for robust error handling.
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text;
  } catch (error) {
    throw new Error(`Failed to generate caption: ${getErrorMessage(error)}`);
  }
};