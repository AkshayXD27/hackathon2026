module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "No prompt provided" });
    }

    const apiKey = process.env.AI_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "AI key not configured" });
    }

    const systemPrompt = `You are the 'Eatzy Group Food Engine'. Your goal is to rapidly find a perfect common dinner recommendation that maximizes group satisfaction based on the friends' constraints.

CRITICAL RULES:
1. NO COMPROMISE PLACES: If two people want conflicting things (like Sushi and Ramen), DO NOT suggest a "place that serves both". You must make a hard, definitive choice of exactly ONE cuisine or dish that satisfies the overarching constraints.
2. HEALTH MATTERS: When breaking ties between cravings, heavily favor the option that is objectively healthier.
3. ABSOLUTE DEALBREAKERS: Dietary restrictions and allergies are absolute. A recommendation MUST NOT violate them.
4. BUDGET LIMITS: The recommendation must fit within the lowest budget constraint in the group.
5. FORMAT: Provide exactly one specific recommendation, followed by a punchy 2-sentence explanation of why it was chosen based on their health, budget, and diets. No markdown formatting.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
        "messages": [
          { "role": "system", "content": systemPrompt },
          { "role": "user", "content": prompt }
        ]
      })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter API Error:", errorText);
        throw new Error(`OpenRouter API failed: ${response.status}`);
    }

    const result = await response.json();
    return res.status(200).json(result);

  } catch (error) {
    console.error("Engine handler error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message || error}` });
  }
}
