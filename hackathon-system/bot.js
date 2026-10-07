const TelegramBot = require("node-telegram-bot-api");
const db = require("./database");

let botStarted = false;

function startBot() {
  // Prevent accidental double-start inside the same Node process
  if (botStarted) {
    console.log("⚠️ Telegram bot is already running. Skipping second start.");
    return;
  }

  const token = process.env.BOT_TOKEN;
  const adminId = String(process.env.TELEGRAM_ADMIN_ID || "");

  if (!token || !adminId) {
    console.error("❌ Missing BOT_TOKEN or TELEGRAM_ADMIN_ID in .env");
    return;
  }

  botStarted = true;

  /*
   * STABLE TELEGRAM POLLING CONFIG
   *
   * interval = small delay between polling requests
   * timeout  = Telegram long-polling timeout
   * autoStart = start polling automatically
   */
  const bot = new TelegramBot(token, {
    polling: {
      interval: 1000,
      autoStart: true,
      params: {
        timeout: 30
      }
    }
  });

  const pending = new Map();
  const editPending = new Map();

  // ==========================================
  // ADMIN CHECK
  // ==========================================

  function isAdmin(msg) {
    return String(msg.from?.id || "") === adminId;
  }

  function deny(msg) {
    return bot.sendMessage(
      msg.chat.id,
      "⛔ You are not authorized to manage NeNoX Forge hackathons."
    );
  }

  function cancelOperation(chatId) {
    pending.delete(chatId);
    editPending.delete(chatId);
  }

  // ==========================================
  // /START
  // ==========================================

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
        "/approve ID — Approve a hackathon",
        "/delete ID — Delete a hackathon",
        "/cancel — Cancel current operation",
        "/help — Show help"
      ].join("\n")
    );
  });

  // ==========================================
  // /HELP
  // ==========================================

  bot.onText(/^\/help$/, (msg) => {
    if (!isAdmin(msg)) return deny(msg);

    bot.sendMessage(
      msg.chat.id,
      [
        "📚 NeNoX Forge Help",
        "",
        "/add — Add a new hackathon",
        "/list — List saved hackathons",
        "/edit ID — Edit a hackathon",
        "/approve ID — Approve a hackathon",
        "/delete ID — Delete a hackathon",
        "/cancel — Cancel current operation"
      ].join("\n")
    );
  });

  // ==========================================
  // /CANCEL
  // ==========================================

  bot.onText(/^\/cancel$/, (msg) => {
    if (!isAdmin(msg)) return deny(msg);

    cancelOperation(msg.chat.id);

    bot.sendMessage(
      msg.chat.id,
      "✅ Current operation cancelled."
    );
  });

  // ==========================================
  // /ADD
  // ==========================================

  bot.onText(/^\/add$/, (msg) => {
    if (!isAdmin(msg)) return deny(msg);

    cancelOperation(msg.chat.id);

    pending.set(msg.chat.id, {
      step: 1,
      data: {}
    });

    bot.sendMessage(
      msg.chat.id,
      [
        "➕ Add New Hackathon",
        "",
        "Step 1/11",
        "Enter the hackathon name."
      ].join("\n")
    );
  });

  // ==========================================
  // /LIST
  // ==========================================

  bot.onText(/^\/list$/, (msg) => {
    if (!isAdmin(msg)) return deny(msg);

    const events = db
      .prepare(`
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
          description,
          status
        FROM hackathons
        ORDER BY id ASC
      `)
      .all();

    if (events.length === 0) {
      return bot.sendMessage(
        msg.chat.id,
        "📭 No hackathons have been saved yet."
      );
    }

    const lines = [
      "📋 Saved Hackathons",
      ""
    ];

    for (const event of events) {
      lines.push(
        `#${event.id} — ${event.title}`,
        `Status: ${event.status}`,
        `Organizer: ${event.organizer || "-"}`,
        `City: ${event.city || "-"}`,
        `Venue: ${event.venue || "-"}`,
        `Format: ${event.format || "-"}`,
        `Event date: ${event.event_date || "-"}`,
        `Deadline: ${event.deadline || "-"}`,
        `Eligibility: ${event.eligibility || "-"}`,
        `Team size: ${
          event.team_size
            ? `${event.team_size} member(s)`
            : "-"
        }`,
        ""
      );
    }

    bot.sendMessage(
      msg.chat.id,
      lines.join("\n")
    );
  });

  // ==========================================
  // /APPROVE
  // ==========================================

  bot.onText(/^\/approve\s+(\d+)$/, (msg, match) => {
    if (!isAdmin(msg)) return deny(msg);

    const id = Number(match[1]);

    const event = db
      .prepare(`
        SELECT *
        FROM hackathons
        WHERE id = ?
      `)
      .get(id);

    if (!event) {
      return bot.sendMessage(
        msg.chat.id,
        `❌ Hackathon #${id} not found.`
      );
    }

    if (event.status === "approved") {
      return bot.sendMessage(
        msg.chat.id,
        `ℹ️ Hackathon #${id} is already approved.`
      );
    }

    // BASIC INFORMATION
    if (
      !event.title ||
      !event.organizer ||
      !event.city
    ) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Cannot approve.\n\nRequired basic information is missing."
      );
    }

    // JAIPUR ONLY
    if (
      !event.city
        .toLowerCase()
        .includes("jaipur")
    ) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Cannot approve.\n\nOnly Jaipur hackathons are published."
      );
    }

    // PHYSICAL ONLY
    if (
      !event.format ||
      event.format.toLowerCase() !== "physical"
    ) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Cannot approve.\n\nOnly physical hackathons are published."
      );
    }

    // REGISTRATION LINK
    if (!event.registration_url) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Cannot approve.\n\nRegistration link is missing."
      );
    }

    // ELIGIBILITY
    if (!event.eligibility) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Cannot approve.\n\nEligibility is missing."
      );
    }

    // UNCERTAIN = DRAFT
    if (
      event.eligibility ===
      "UNCERTAIN / NEED VERIFICATION"
    ) {
      return bot.sendMessage(
        msg.chat.id,
        [
          "⚠️ Cannot approve this hackathon.",
          "",
          "Eligibility is marked as uncertain.",
          "",
          `Use /edit ${id}`,
          "and update the eligibility."
        ].join("\n")
      );
    }

    // TEAM SIZE
    if (!event.team_size) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Cannot approve.\n\nTeam size is missing."
      );
    }

    const teamSize = Number(event.team_size);

    if (
      !Number.isInteger(teamSize) ||
      teamSize < 1 ||
      teamSize > 6
    ) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Cannot approve.\n\nTeam size must be between 1 and 6."
      );
    }

    // APPROVE
    db.prepare(`
      UPDATE hackathons
      SET status = 'approved'
      WHERE id = ?
    `).run(id);

    bot.sendMessage(
      msg.chat.id,
      [
        "✅ HACKATHON APPROVED",
        "",
        `ID: #${event.id}`,
        `Name: ${event.title}`,
        `Organizer: ${event.organizer}`,
        `City: ${event.city}`,
        `Format: ${event.format}`,
        `Eligibility: ${event.eligibility}`,
        `Team size: ${event.team_size} member(s)`,
        "",
        "The hackathon can now appear on the website."
      ].join("\n")
    );
  });

  // ==========================================
  // /DELETE
  // ==========================================

  bot.onText(/^\/delete\s+(\d+)$/, (msg, match) => {
    if (!isAdmin(msg)) return deny(msg);

    const id = Number(match[1]);

    const event = db
      .prepare(`
        SELECT id, title
        FROM hackathons
        WHERE id = ?
      `)
      .get(id);

    if (!event) {
      return bot.sendMessage(
        msg.chat.id,
        `❌ Hackathon #${id} not found.`
      );
    }

    db.prepare(`
      DELETE FROM hackathons
      WHERE id = ?
    `).run(id);

    bot.sendMessage(
      msg.chat.id,
      `🗑️ Hackathon #${id} deleted successfully.`
    );
  });

  // ==========================================
  // /EDIT
  // ==========================================

  bot.onText(/^\/edit\s+(\d+)$/, (msg, match) => {
    if (!isAdmin(msg)) return deny(msg);

    const id = Number(match[1]);

    const event = db
      .prepare(`
        SELECT *
        FROM hackathons
        WHERE id = ?
      `)
      .get(id);

    if (!event) {
      return bot.sendMessage(
        msg.chat.id,
        `❌ Hackathon #${id} not found.`
      );
    }

    cancelOperation(msg.chat.id);

    editPending.set(msg.chat.id, {
      id,
      step: 1,
      field: null
    });

    bot.sendMessage(
      msg.chat.id,
      [
        `✏️ Editing Hackathon #${id}`,
        "",
        "Select the field you want to change:",
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
        "Reply with a number from 1 to 11."
      ].join("\n")
    );
  });

  // ==========================================
  // GENERAL MESSAGE HANDLER
  // ==========================================

  bot.on("message", (msg) => {
    if (!msg.text) return;
    if (!isAdmin(msg)) return;

    const text = msg.text.trim();

    // Ignore commands
    if (text.startsWith("/")) return;

    const chatId = msg.chat.id;

    // ========================================
    // ADD FLOW
    // ========================================

    const add = pending.get(chatId);

    if (add) {

      // STEP 1
      if (add.step === 1) {
        add.data.title = text;
        add.step = 2;

        return bot.sendMessage(
          chatId,
          "Step 2/11\nEnter the organizer name."
        );
      }

      // STEP 2
      if (add.step === 2) {
        add.data.organizer = text;
        add.step = 3;

        return bot.sendMessage(
          chatId,
          "Step 3/11\nEnter the city."
        );
      }

      // STEP 3
      if (add.step === 3) {
        add.data.city = text;
        add.step = 4;

        return bot.sendMessage(
          chatId,
          "Step 4/11\nEnter the venue/address."
        );
      }

      // STEP 4
      if (add.step === 4) {
        add.data.venue = text;
        add.step = 5;

        return bot.sendMessage(
          chatId,
          [
            "Step 5/11",
            "Enter the format.",
            "",
            "physical",
            "or",
            "online"
          ].join("\n")
        );
      }

      // STEP 5
      if (add.step === 5) {

        const format = text.toLowerCase();

        if (
          format !== "physical" &&
          format !== "online"
        ) {
          return bot.sendMessage(
            chatId,
            "❌ Please reply with physical or online."
          );
        }

        add.data.format = format;
        add.step = 6;

        return bot.sendMessage(
          chatId,
          "Step 6/11\nEnter the event date."
        );
      }

      // STEP 6
      if (add.step === 6) {
        add.data.event_date = text;
        add.step = 7;

        return bot.sendMessage(
          chatId,
          "Step 7/11\nEnter the registration deadline."
        );
      }

      // STEP 7
      if (add.step === 7) {
        add.data.deadline = text;
        add.step = 8;

        return bot.sendMessage(
          chatId,
          "Step 8/11\nEnter the registration URL."
        );
      }

      // STEP 8
      if (add.step === 8) {

        if (!text) {
          return bot.sendMessage(
            chatId,
            "❌ Registration link cannot be empty. Send it again."
          );
        }

        add.data.registration_url = text;
        add.step = 9;

        return bot.sendMessage(
          chatId,
          [
            "Step 9/11",
            "Select eligibility:",
            "",
            "1️⃣ OPEN FOR ALL",
            "2️⃣ ONLY FOR JECRC STUDENTS",
            "3️⃣ UNCERTAIN / NEED VERIFICATION",
            "",
            "Reply with 1, 2 or 3."
          ].join("\n")
        );
      }

      // STEP 9
      if (add.step === 9) {

        const eligibilityMap = {
          "1": "OPEN FOR ALL",
          "2": "ONLY FOR JECRC STUDENTS",
          "3": "UNCERTAIN / NEED VERIFICATION"
        };

        if (!eligibilityMap[text]) {
          return bot.sendMessage(
            chatId,
            "❌ Please reply with 1, 2 or 3."
          );
        }

        add.data.eligibility =
          eligibilityMap[text];

        add.step = 10;

        return bot.sendMessage(
          chatId,
          [
            "Step 10/11",
            "Enter the maximum team size.",
            "",
            "Enter a number from 1 to 6."
          ].join("\n")
        );
      }

      // STEP 10
      if (add.step === 10) {

        const teamSize = Number(text);

        if (
          !Number.isInteger(teamSize) ||
          teamSize < 1 ||
          teamSize > 6
        ) {
          return bot.sendMessage(
            chatId,
            "❌ Team size must be a number from 1 to 6."
          );
        }

        add.data.team_size = String(teamSize);
        add.step = 11;

        return bot.sendMessage(
          chatId,
          "Step 11/11\nEnter a short description."
        );
      }

      // STEP 11
      if (add.step === 11) {

        add.data.description = text;

        const d = add.data;

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
        `).run(d);

        pending.delete(chatId);

        return bot.sendMessage(
          chatId,
          [
            "✅ HACKATHON SAVED AS DRAFT",
            "",
            `ID: #${result.lastInsertRowid}`,
            `Name: ${d.title}`,
            `Organizer: ${d.organizer}`,
            `City: ${d.city}`,
            `Venue: ${d.venue}`,
            `Format: ${d.format}`,
            `Event date: ${d.event_date}`,
            `Deadline: ${d.deadline}`,
            `Eligibility: ${d.eligibility}`,
            `Team size: ${d.team_size} member(s)`,
            "",
            `Use /approve ${result.lastInsertRowid} after verification.`
          ].join("\n")
        );
      }
    }

    // ========================================
    // EDIT FLOW
    // ========================================

    const edit = editPending.get(chatId);

    if (!edit) return;

    // FIELD SELECTION
    if (edit.step === 1) {

      const fieldMap = {
        "1": "title",
        "2": "organizer",
        "3": "city",
        "4": "venue",
        "5": "format",
        "6": "event_date",
        "7": "deadline",
        "8": "registration_url",
        "9": "eligibility",
        "10": "team_size",
        "11": "description"
      };

      const field = fieldMap[text];

      if (!field) {
        return bot.sendMessage(
          chatId,
          "❌ Please reply with a number from 1 to 11."
        );
      }

      edit.field = field;
      edit.step = 2;

      return bot.sendMessage(
        chatId,
        `Enter the new value for ${field}.`
      );
    }

    // NEW VALUE
    if (edit.step === 2) {

      // FORMAT
      if (edit.field === "format") {

        const format = text.toLowerCase();

        if (
          format !== "physical" &&
          format !== "online"
        ) {
          return bot.sendMessage(
            chatId,
            "❌ Format must be physical or online."
          );
        }

        edit.value = format;
      }

      // REGISTRATION URL
      else if (
        edit.field === "registration_url"
      ) {

        if (!text) {
          return bot.sendMessage(
            chatId,
            "❌ Registration link cannot be empty."
          );
        }

        edit.value = text;
      }

      // ELIGIBILITY
      else if (
        edit.field === "eligibility"
      ) {

        const eligibilityMap = {
          "1": "OPEN FOR ALL",
          "2": "ONLY FOR JECRC STUDENTS",
          "3": "UNCERTAIN / NEED VERIFICATION"
        };

        if (!eligibilityMap[text]) {
          return bot.sendMessage(
            chatId,
            "❌ Reply with 1, 2 or 3."
          );
        }

        edit.value =
          eligibilityMap[text];
      }

      // TEAM SIZE
      else if (
        edit.field === "team_size"
      ) {

        const teamSize = Number(text);

        if (
          !Number.isInteger(teamSize) ||
          teamSize < 1 ||
          teamSize > 6
        ) {
          return bot.sendMessage(
            chatId,
            "❌ Team size must be a number from 1 to 6."
          );
        }

        edit.value = String(teamSize);
      }

      // OTHER FIELDS
      else {
        edit.value = text;
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
        editPending.delete(chatId);

        return bot.sendMessage(
          chatId,
          "❌ Invalid field."
        );
      }

      db.prepare(`
        UPDATE hackathons
        SET ${edit.field} = ?
        WHERE id = ?
      `).run(
        edit.value,
        edit.id
      );

      // Re-check after every edit
      db.prepare(`
        UPDATE hackathons
        SET status = 'draft'
        WHERE id = ?
      `).run(edit.id);

      editPending.delete(chatId);

      return bot.sendMessage(
        chatId,
        [
          "✅ Hackathon updated.",
          "",
          `ID: #${edit.id}`,
          `Changed field: ${edit.field}`,
          `New value: ${edit.value}`,
          "",
          "Status changed back to DRAFT.",
          "",
          `Use /approve ${edit.id} after checking it.`
        ].join("\n")
      );
    }
  });

  // ==========================================
  // TELEGRAM POLLING ERRORS
  // ==========================================

  bot.on("polling_error", (error) => {
    console.error("====================================");
    console.error("❌ TELEGRAM POLLING ERROR");
    console.error("Message:", error?.message || error);
    console.error("Code:", error?.code || "unknown");
    console.error("====================================");
  });

  // ==========================================
  // TELEGRAM GENERAL ERRORS
  // ==========================================

  bot.on("error", (error) => {
    console.error("====================================");
    console.error("❌ TELEGRAM BOT ERROR");
    console.error("Message:", error?.message || error);
    console.error("Code:", error?.code || "unknown");
    console.error("====================================");
  });

  // ==========================================
  // PROCESS ERRORS
  // ==========================================

  process.on("unhandledRejection", (reason) => {
    console.error("❌ UNHANDLED PROMISE REJECTION:");
    console.error(reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("❌ UNCAUGHT EXCEPTION:");
    console.error(error);
  });

  // ==========================================
  // STARTUP TEST
  // ==========================================

  bot.getMe()
    .then((me) => {
      console.log("====================================");
      console.log("✅ Telegram bot connected");
      console.log(`🤖 Bot: @${me.username}`);
      console.log(`🆔 Bot ID: ${me.id}`);
      console.log(`👤 Admin ID: ${adminId}`);
      console.log("📡 Polling: ACTIVE");
      console.log("====================================");
    })
    .catch((error) => {
      console.error("====================================");
      console.error("❌ Telegram connection test failed");
      console.error(error?.message || error);
      console.error("====================================");
    });

  console.log("Telegram bot is starting...");
}

module.exports = startBot;