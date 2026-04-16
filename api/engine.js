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

    // First API call with reasoning
    const response1 = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "google/gemma-4-26b-a4b-it:free",
        "messages": [
          {
            "role": "system",
            "content": "You are the 'Eatzy Group Food Engine'. Your goal is to rapidly find a perfect common dinner recommendation that maximizes group satisfaction based on the friends' constraints and desires. Provide a clean, specific recommendation and a 2-sentence explanation of why it works for everyone. Do not output markdown, just clean text."
          },
          {
            "role": "user",
            "content": prompt
          }
        ],
        "reasoning": {"enabled": true}
      })
    });

    if (!response1.ok) {
        const errorText = await response1.text();
        console.error("OpenRouter API Error (Call 1):", errorText);
        throw new Error(`OpenRouter API failed on first call: ${response1.status}`);
    }

    const result1 = await response1.json();
    const assistantMessage = result1.choices[0].message;

    // Second API call - model continues reasoning from where it left off
    const messages = [
        {
          "role": "system",
          "content": "You are the 'Eatzy Group Food Engine'. Your goal is to rapidly find a perfect common dinner recommendation that maximizes group satisfaction based on the friends' constraints and desires. Provide a clean, specific recommendation and a 2-sentence explanation of why it works for everyone. Do not output markdown, just clean text."
        },
        {
          "role": "user",
          "content": prompt
        },
        {
          "role": "assistant",
          "content": assistantMessage.content,
          "reasoning_details": assistantMessage.reasoning_details // Pass back unmodified
        },
        {
          "role": "user",
          "content": "Are you sure? Think carefully. Output ONLY the specific final recommendation and a short concluding paragraph so it looks great on the UI. No markdown."
        }
    ];

    const response2 = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "model": "google/gemma-4-26b-a4b-it:free",
        "messages": messages
      })
    });

    if (!response2.ok) {
        const errorText = await response2.text();
        console.error("OpenRouter API Error (Call 2):", errorText);
        throw new Error(`OpenRouter API failed on second call: ${response2.status}`);
    }

    const finalResult = await response2.json();
    
    // Return the final choices back to the client
    return res.status(200).json(finalResult);

  } catch (error) {
    console.error("Engine handler error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message || error}` });
  }
}
