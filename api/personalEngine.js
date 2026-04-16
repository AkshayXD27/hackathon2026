const { MongoClient } = require("mongodb");

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase(uri) {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("EatzyDB");
  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uid, username, budget, dietType, allergies } = req.body;
    if (!uid) return res.status(400).json({ error: "No UID provided" });

    const apiKey = process.env.GOOGLE_KEY;
    if (!apiKey) return res.status(500).json({ error: "Google AI key not configured" });
    const uri = process.env.MONGODB_URI;

    let recentFoodsStr = "No foods logged yet.";
    
    if (uri) {
        try {
            const { db } = await connectToDatabase(uri);
            const logs = await db.collection("food_logs")
                 .find({ uid })
                 .sort({ date_unix: -1 })
                 .limit(10)
                 .toArray();
            
            if(logs.length > 0) {
                recentFoodsStr = logs.map(l => l.food).join(", ");
            }
        } catch(e) { console.error("MongoDB contextual load error", e); }
    }

    const systemPrompt = `You are the 'Eatzy Personal Food Engine'. Your goal is to randomly and playfully suggest EXACTLY ONE food choice for the user right now based on their profile.

USER DATA:
- Name: ${username || "User"}
- Budget: ${budget || "Moderate"}
- Diet: ${dietType || "None"}
- Allergies: ${(allergies || []).join(", ")}

RECENTLY EATEN (DO NOT REPEAT THESE):
${recentFoodsStr}

CRITICAL RULES:
1. FATAL ALLERGIES: You MUST categorically avoid their allergies and stick to their diet type.
2. COMPLETELY RANDOM BUT LOGICAL: Given their budget and diet, pick something fun and different from what they recently ate. 
3. FORMAT: Provide exactly one specific recommendation, returned ONLY as a valid JSON object matching this schema:
{ "foodName": "Crispy Tofu Tacos", "explanation": "A punchy 1-sentence hype explanation exactly why it fits them." }`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [{
                parts: [{ text: `Surprise me! Make it wildly different from any past suggestion. Random seed: ${Date.now()}` }]
            }],
            generationConfig: {
                temperature: 0.9,
                responseMimeType: "application/json"
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google API failed with ${response.status}: ${errText}`);
    }

    const result = await response.json();
    let aiText = result.candidates[0].content.parts[0].text;
    let verdict = {};
    
    try {
        aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        verdict = JSON.parse(aiText);
    } catch(e) {
        verdict = { foodName: "Unknown Custom Choice", explanation: aiText };
    }

    return res.status(200).json({ verdict });

  } catch (error) {
    console.error("Personal Engine error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message || error}` });
  }
}
