```js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./database");
const startBot = require("./bot");

const app = express();

// Middleware
app.use(express.json());

app.use(cors({
  origin: [
    "https://aesthetic-stardust-3cb51a.netlify.app",
    "http://localhost:3000",
    "http://127.0.0.1:5500"
  ]
}));

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "NeNoX Forge Hackathon API"
  });
});

// Get Approved Jaipur Physical Hackathons
app.get("/api/hackathons", (req, res) => {
  try {
    const events = db.prepare(`
      SELECT
        id,
        title,
        organizer,
        city,
        venue,
        format,
        event_date,
        deadline,
        registration_url,
        eligibility,
        description
      FROM hackathons
      WHERE status = 'approved'
        AND lower(city) LIKE '%jaipur%'
        AND lower(format) = 'physical'
      ORDER BY event_date ASC
    `).all();

    res.json(events);
  } catch (error) {
    console.error("Hackathons API error:", error);

    res.status(500).json({
      ok: false,
      message: "Unable to fetch hackathons"
    });
  }
});

// Start Server
const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  startBot();
});
```
