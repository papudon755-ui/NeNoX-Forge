const TelegramBot = require("node-telegram-bot-api");
const db = require("./database");

function startBot() {
  const token = process.env.BOT_TOKEN;
  const adminId = String(process.env.TELEGRAM_ADMIN_ID || "");

  if (!token || !adminId) {
    console.error("Missing BOT_TOKEN or TELEGRAM_ADMIN_ID in .env");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  const pending = new Map();
  const editPending = new Map();

  function isAdmin(msg) {
    return String(msg.from.id) === adminId;
  }

  function deny(msg) {
    return bot.sendMessage(
      msg.chat.id,
      "⛔ You are not authorized to manage NeNoX Forge hackathons."
    );
  }

  // =========================
  // START
  // =========================

  bot.onText(/^\/start$/, (msg) => {
    if (!isAdmin(msg)) return deny(msg);

    bot.sendMessage(
      msg.chat.id,
      [
        "👋 NeNoX Forge Hackathon Manager",
        "",
        "/add — Add a hackathon",
        "/list — List saved hackathons",
        "/edit ID — Edit a hackathon",
        "/approve ID — Publish an event",
        "/delete ID — Delete an event",
        "/cancel — Cancel current operation",
        "/help — Show help"
      ].join("\n")
    );
  });

  // =========================
  // HELP
  // =========================

  bot.onText(/^\/help$/, (msg) => {
    if (!isAdmin(msg)) return deny(msg);

    bot.sendMessage(
      msg.chat.id,
      [
        "📚 NeNoX Forge Help",
        "",
        "/add — Add a new hackathon",
        "/list — List saved hackathons",
        "/edit ID — Edit one field",
        "/approve ID — Publish an event",
        "/delete ID — Delete an event",
        "/cancel — Cancel current operation"
      ].join("\n")
    );
  });

  // =========================
  // CANCEL
  // =========================

  bot.onText(/^\/cancel$/, (msg) => {
    if (!isAdmin(msg)) return deny(msg);

    pending.delete(msg.chat.id);
    editPending.delete(msg.chat.id);

    bot.sendMessage(msg.chat.id, "❌ Current operation cancelled.");
  });

  // =========================
  // ADD
  // =========================

  bot.onText(/^\/add$/, (msg) => {
    if (!isAdmin(msg)) return deny(msg);

    pending.set(msg.chat.id, {
      step: 0,
      values: {}
    });

    bot.sendMessage(
      msg.chat.id,
      "Let's add a hackathon.\n\n1/11 — What is the hackathon name?"
    );
  });

  // =========================
  // LIST
  // =========================

  bot.onText(/^\/list$/, (msg) => {
    if (!isAdmin(msg)) return deny(msg);

    const events = db.prepare(`
      SELECT
        id,
        title,
        city,
        format,
        status,
        deadline,
        team_size
      FROM hackathons
      ORDER BY id DESC
      LIMIT 30
    `).all();

    if (!events.length) {
      return bot.sendMessage(
        msg.chat.id,
        "No hackathons saved yet."
      );
    }

    const text = events
      .map((event) =>
        `#${event.id} — ${event.title}\n` +
        `${event.city} | ${event.format} | ${event.status}\n` +
        `Team size: ${event.team_size || "Not set"}\n` +
        `Deadline: ${event.deadline || "Not set"}`
      )
      .join("\n\n");

    bot.sendMessage(msg.chat.id, text);
  });

  // =========================
  // EDIT
  // =========================

  bot.onText(/^\/edit\s+(\d+)$/, (msg, match) => {
    if (!isAdmin(msg)) return deny(msg);

    const id = Number(match[1]);

    const event = db
      .prepare("SELECT * FROM hackathons WHERE id = ?")
      .get(id);

    if (!event) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Hackathon ID not found."
      );
    }

    editPending.set(msg.chat.id, {
      id,
      step: 0
    });

    bot.sendMessage(
      msg.chat.id,
      [
        `✏️ Editing Hackathon #${id}`,
        "",
        `Current name: ${event.title}`,
        "",
        "Which field do you want to change?",
        "",
        "1. Hackathon name",
        "2. Organizer",
        "3. City",
        "4. Venue",
        "5. Format",
        "6. Event date",
        "7. Registration deadline",
        "8. Registration URL",
        "9. Eligibility",
        "10. Team size",
        "11. Description",
        "",
        "Reply with a number from 1 to 11.",
        "",
        "Use /cancel to cancel."
      ].join("\n")
    );
  });

  // =========================
  // APPROVE
  // =========================

  bot.onText(/^\/approve\s+(\d+)$/, (msg, match) => {
    if (!isAdmin(msg)) return deny(msg);

    const id = Number(match[1]);

    const event = db
      .prepare("SELECT * FROM hackathons WHERE id = ?")
      .get(id);

    if (!event) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Hackathon ID not found."
      );
    }

    const eligible =
      event.city.toLowerCase().includes("jaipur") &&
      event.format.toLowerCase() === "physical" &&
      event.eligibility.trim().length > 0 &&
      event.registration_url.trim().length > 0;

    if (!eligible) {
      return bot.sendMessage(
        msg.chat.id,
        [
          "❌ Cannot approve yet.",
          "",
          "Check that:",
          "• Event is physical",
          "• Event is in Jaipur",
          "• Eligibility is filled",
          "• Registration URL is filled"
        ].join("\n")
      );
    }

    db.prepare(
      "UPDATE hackathons SET status = 'approved' WHERE id = ?"
    ).run(id);

    bot.sendMessage(
      msg.chat.id,
      `✅ Hackathon #${id} approved.`
    );
  });

  // =========================
  // DELETE
  // =========================

  bot.onText(/^\/delete\s+(\d+)$/, (msg, match) => {
    if (!isAdmin(msg)) return deny(msg);

    const id = Number(match[1]);

    const result = db
      .prepare("DELETE FROM hackathons WHERE id = ?")
      .run(id);

    bot.sendMessage(
      msg.chat.id,
      result.changes
        ? `🗑️ Deleted hackathon #${id}.`
        : "❌ Hackathon ID not found."
    );
  });

  // =========================
  // ADD QUESTIONS
  // =========================

  const questions = [
    "1/11 — Hackathon name?",

    "2/11 — Organizer name?",

    "3/11 — City? Enter Jaipur if it is in Jaipur.",

    "4/11 — Venue/address?",

    "5/11 — Format? Reply exactly: physical or online.",

    "6/11 — Event date? Use YYYY-MM-DD or a date range.",

    "7/11 — Registration deadline? Use YYYY-MM-DD.",

    "8/11 — Registration URL?",

    "9/11 — Eligibility? For example: Open to all college students.",

    "10/11 — Team size? For example: 1-6 members.",

    "11/11 — Short description?"
  ];

  const fields = [
    "title",
    "organizer",
    "city",
    "venue",
    "format",
    "event_date",
    "deadline",
    "registration_url",
    "eligibility",
    "team_size",
    "description"
  ];

  // =========================
  // MESSAGE HANDLER
  // =========================

  bot.on("message", (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    if (!isAdmin(msg)) return;

    const value = msg.text.trim();

    // -------------------------
    // EDIT FLOW
    // -------------------------

    const edit = editPending.get(msg.chat.id);

    if (edit) {
      // Choose field
      if (edit.step === 0) {
        const fieldNumber = Number(value);

        if (
          !Number.isInteger(fieldNumber) ||
          fieldNumber < 1 ||
          fieldNumber > 11
        ) {
          return bot.sendMessage(
            msg.chat.id,
            "Please choose a number from 1 to 11."
          );
        }

        edit.field = fields[fieldNumber - 1];
        edit.step = 1;

        const labels = {
          title: "hackathon name",
          organizer: "organizer name",
          city: "city",
          venue: "venue/address",
          format: "format (physical or online)",
          event_date: "event date",
          deadline: "registration deadline",
          registration_url: "registration URL",
          eligibility: "eligibility",
          team_size: "team size",
          description: "short description"
        };

        return bot.sendMessage(
          msg.chat.id,
          `✏️ Enter the new ${labels[edit.field]}:`
        );
      }

      // Enter new value
      if (edit.step === 1) {
        if (
          edit.field === "format" &&
          !["physical", "online"].includes(value.toLowerCase())
        ) {
          return bot.sendMessage(
            msg.chat.id,
            "Reply with physical or online."
          );
        }

        if (
          edit.field === "registration_url" &&
          !/^https?:\/\/\S+/i.test(value)
        ) {
          return bot.sendMessage(
            msg.chat.id,
            "Please enter a valid URL beginning with http:// or https://."
          );
        }

        const allowedFields = [
          "title",
          "organizer",
          "city",
          "venue",
          "format",
          "event_date",
          "deadline",
          "registration_url",
          "eligibility",
          "team_size",
          "description"
        ];

        if (!allowedFields.includes(edit.field)) {
          editPending.delete(msg.chat.id);

          return bot.sendMessage(
            msg.chat.id,
            "❌ Invalid field."
          );
        }

        db.prepare(
          `UPDATE hackathons SET ${edit.field} = ? WHERE id = ?`
        ).run(value, edit.id);

        editPending.delete(msg.chat.id);

        return bot.sendMessage(
          msg.chat.id,
          [
            `✅ Hackathon #${edit.id} updated!`,
            "",
            `Changed: ${edit.field}`,
            `New value: ${value}`
          ].join("\n")
        );
      }
    }

    // -------------------------
    // ADD FLOW
    // -------------------------

    const entry = pending.get(msg.chat.id);

    if (!entry) return;

    const field = fields[entry.step];

    if (
      field === "format" &&
      !["physical", "online"].includes(value.toLowerCase())
    ) {
      return bot.sendMessage(
        msg.chat.id,
        "Reply with physical or online."
      );
    }

    if (
      field === "registration_url" &&
      !/^https?:\/\/\S+/i.test(value)
    ) {
      return bot.sendMessage(
        msg.chat.id,
        "Please enter a valid URL beginning with http:// or https://."
      );
    }

    entry.values[field] = value;
    entry.step += 1;

    if (entry.step < questions.length) {
      return bot.sendMessage(
        msg.chat.id,
        questions[entry.step]
      );
    }

    // -------------------------
    // SAVE TO DATABASE
    // -------------------------

    const result = db.prepare(`
      INSERT INTO hackathons (
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
        description,
        status
      )
      VALUES (
        @title,
        @organizer,
        @city,
        @venue,
        @format,
        @event_date,
        @deadline,
        @registration_url,
        @eligibility,
        @team_size,
        @description,
        'draft'
      )
    `).run(entry.values);

    pending.delete(msg.chat.id);

    bot.sendMessage(
      msg.chat.id,
      [
        "📝 Saved as Draft!",
        "",
        `ID: ${result.lastInsertRowid}`,
        `Name: ${entry.values.title}`,
        `Team size: ${entry.values.team_size}`,
        "",
        `Review with /list`,
        `Publish with /approve ${result.lastInsertRowid}`
      ].join("\n")
    );
  });

  // =========================
  // POLLING ERROR
  // =========================

  bot.on("polling_error", (error) => {
    console.error(
      "Telegram polling error:",
      error.message
    );
  });

  console.log("Telegram bot is running.");

  return bot;
}

module.exports = startBot;