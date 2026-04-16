export default async function handler(req, res) {
  // Allow only POST requests (since we are sending prompt data)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Extract the LLM prompt sent securely from our dashboard.js
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // We proxy the request natively to OpenRouter behind the scenes,
    // safely utilizing your Vercel Environment Variable "ai_api".
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        // Vercel maps configured environment variables to process.env locally/in-cloud
        "Authorization": `Bearer ${process.env.ai_api || process.env.AI_API}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://eatzy.vercel.app",
        "X-Title": "Eatzy Backend Server"
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        messages: [
          { role: "system", content: "You are the Eatzy engine. Return only the final restaurant/cuisine recommendation." },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    // Get the exact JSON block returned by OpenRouter and send it directly 
    // back to the frontend without exposing the API key to the client!
    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error("Vercel Engine API Error:", error);
    return res.status(500).json({ error: 'Failed to process backend AI request' });
  }
}
