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
    const { prompt, membersMap } = req.body;
    if (!prompt) return res.status(400).json({ error: "No prompt provided" });

    const apiKey = process.env.AI_KEY;
    if (!apiKey) return res.status(500).json({ error: "AI key not configured" });
    const uri = process.env.MONGODB_URI;

    let recentFoodsContext = "";
    let dbInstance = null;
    
    // Connect to DB and pull last 10 meals per user
    if (uri && membersMap) {
        try {
            const { db } = await connectToDatabase(uri);
            dbInstance = db;
            for(const uid of Object.keys(membersMap)) {
                const logs = await db.collection("food_logs")
                     .find({ uid })
                     .sort({ date_unix: -1 })
                     .limit(10)
                     .toArray();
                
                if(logs.length > 0) {
                    const foodNames = logs.map(l => l.food).join(", ");
                    recentFoodsContext += `${membersMap[uid]} recently ate: ${foodNames}\n`;
                }
            }
        } catch(e) { console.error("MongoDB contextual load error", e); }
    }

    const systemPrompt = `You are the 'Eatzy Group Food Engine'. Your goal is to rapidly find a perfect common dinner recommendation that maximizes group satisfaction based on the friends' constraints.

CRITICAL RULES:
1. CONFLICT RESOLVER: If preferences clash heavily (e.g. one wants spicy, one hates spicy; or one wants burgers, one wants light food), you MUST suggest a compromise dish or restaurant type (like a mild dish with optional spicy addons, or an establishment serving both hearty meals and robust salads).
2. HARD ALLERGY SAFETY NET: You are protecting their health. Filters for allergies or strict diets (vegan, gluten-free, nut-free, etc.) are ABSOLUTE. You must fatally reject any choice that even risks violating these requirements.
3. BUDGET LIMITS: The recommendation must fit within the lowest budget constraint in the group.
4. REPEAT AVOIDANCE: Review the recently eaten foods below. You MUST absolutely skip and avoid recommending foods that the group members have already eaten recently.
5. FORMAT: Provide your response EXACTLY as a valid JSON object matching this schema, with no markdown wrappers or extra text:
{ "foodName": "Spicy Tuna Sushi", "explanation": "Punchy 2-sentence explanation exactly why it was chosen based on their health, budget, and diets." }

RECENT FOODS FROM GROUP:
${recentFoodsContext || "No recent foods logged."}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "openrouter/elephant-alpha",
        "temperature": 0.8,
        "messages": [
          { "role": "system", "content": systemPrompt },
          { "role": "user", "content": prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API failed: ${response.status} - ${await response.text()}`);
    }

    const result = await response.json();
    let aiText = result.choices[0].message.content;
    let verdict = {};
    
    try {
        // Strip codeblocks if model hallucinated them
        aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
        verdict = JSON.parse(aiText);
    } catch(e) {
        console.error("Failed to parse JSON out of AI text: ", aiText);
        verdict = { foodName: "Unknown Choice", explanation: aiText };
    }

    // Auto-Log feature: Save chosen food to DB instantly
    if (dbInstance && membersMap && verdict.foodName && verdict.foodName !== "Unknown Choice") {
        try {
             let unixTime = Math.floor(Date.now() / 1000);
             try {
                const tr = await fetch("https://timeapi.io/api/v1/time/current/unix");
                const tj = await tr.json();
                if (tj && tj.unix_timestamp) unixTime = tj.unix_timestamp;
             } catch(timeErr){}

             const inserts = Object.keys(membersMap).map(uid => ({
                  uid,
                  food: verdict.foodName,
                  date_unix: unixTime,
                  created_at: new Date(),
                  auto_generated: true
             }));
             await dbInstance.collection("food_logs").insertMany(inserts);
        } catch(logErr) { console.error("Engine Auto-Log Error", logErr); }
    }

    return res.status(200).json({ verdict });

  } catch (error) {
    console.error("Engine handler error:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message || error}` });
  }
}
