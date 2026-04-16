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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { uid, food, dayOffset = 0 } = req.body;
    if (!uid || !food) return res.status(400).json({ error: "Missing parameters" });

    const uri = process.env.MONGODB_URI;
    if (!uri) return res.status(500).json({ error: "MongoDB URI not configured" });

    // Use current TimeAPI as requested
    let unixTime = Math.floor(Date.now() / 1000);
    try {
        const timeResponse = await fetch("https://timeapi.io/api/v1/time/current/unix");
        unixTime = await timeResponse.json(); 
        if(typeof unixTime !== 'number') unixTime = parseInt(unixTime) || Math.floor(Date.now() / 1000);
    } catch (apiErr) {
        console.warn("TimeAPI failed, using local server time.");
    }
    
    // Adjust for today or yesterday (-1 day)
    unixTime += parseInt(dayOffset) * 86400;

    const { db } = await connectToDatabase(uri);
    await db.collection("food_logs").insertOne({
      uid,
      food,
      date_unix: unixTime,
      created_at: new Date()
    });

    return res.status(200).json({ success: true, message: "Food logged successfully" });

  } catch (error) {
    console.error("logFood Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
