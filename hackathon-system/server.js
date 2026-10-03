require("dotenv").config();

const express = require("express");
const db = require("./database");
const startBot = require("./bot");

const app = express();

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "NeNoX Forge Hackathon API"
  });
});

app.get("/api/hackathons", (req, res) => {
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
});

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
  startBot();
});