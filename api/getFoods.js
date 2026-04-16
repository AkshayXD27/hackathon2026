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
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: "Missing parameters" });

    const uri = process.env.MONGODB_URI;
    if (!uri) return res.status(500).json({ error: "MongoDB URI not configured" });

    const { db } = await connectToDatabase(uri);
    const logs = await db.collection("food_logs")
                         .find({ uid })
                         .sort({ date_unix: -1 })
                         .limit(50)
                         .toArray();

    return res.status(200).json({ success: true, logs });

  } catch (error) {
    console.error("getFoods Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
