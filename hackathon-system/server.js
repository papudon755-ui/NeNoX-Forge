require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./database");
const startBot = require("./bot");

const app = express();

app.use(express.json());

app.use(cors({
  origin: [
    "https://papudon755-ui.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

// =========================================================
// HEALTH
// =========================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "NeNoX Forge Hackathon API"
  });
});

// =========================================================
// HACKATHONS
// =========================================================

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
        team_size,
        description
      FROM hackathons
      WHERE status = 'approved'
        AND lower(city) LIKE '%jaipur%'
        AND lower(format) = 'physical'
      ORDER BY
        CASE
          WHEN event_date = '' OR event_date = 'TBA' THEN 1
          ELSE 0
        END,
        event_date ASC
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

// =========================================================
// SERVER
// =========================================================

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  startBot();
});