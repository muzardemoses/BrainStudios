import { ai } from "@workspace/integrations-gemini-ai";

export async function askDirectorAgent(instruction: string, context: string) {
  const prompt = `You are the Director Agent inside BrainStudios, an AI production studio. A director gave this instruction: "${instruction}". Current production: ${context}. Reply in 2 concise sentences: acknowledge the creative intent, then name the specific downstream production areas that should be revised.`;
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 8192 },
  });
  return result.text?.trim() || "I mapped the revision across story, character, storyboard, cinematography, sound, and preview dependencies.";
}