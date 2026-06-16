require("dotenv").config();

const { Telegraf } = require("telegraf");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const { askLLM } = require("./llm");
const { getMarketDayInfo } = require("./marketday");

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const SUBSCRIBERS_FILE = path.join(__dirname, "subscribers.json");

// Stores conversation history per user in memory
const conversationHistories = {};
const MAX_HISTORY = 10; // Keep last 10 exchanges

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFirstName(ctx) {
    const full = ctx.from.first_name || "friend";
    return full.replace(/[^a-zA-Z]/g, " ").trim().split(" ")[0] || "friend";
}

function loadSubscribers() {
    try {
        const data = fs.readFileSync(SUBSCRIBERS_FILE, "utf8");
        return JSON.parse(data);
    } catch {
        return {};
    }
}

function saveSubscribers(subscribers) {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
}

function getHistory(chatId) {
    if (!conversationHistories[chatId]) {
        conversationHistories[chatId] = [];
    }
    return conversationHistories[chatId];
}

function addToHistory(chatId, role, content) {
    const history = getHistory(chatId);
    history.push({ role, content });
    // Keep only last MAX_HISTORY messages to avoid token overflow
    if (history.length > MAX_HISTORY * 2) {
        conversationHistories[chatId] = history.slice(-MAX_HISTORY * 2);
    }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.start((ctx) => {
    const firstName = getFirstName(ctx);
    const info = getMarketDayInfo();

    ctx.reply(
        `Hey ${firstName}! 👋 Welcome to Itam Bot!\n\nI'm here to help you keep track of Itam Market days so you never miss a good market run. \n\nYou can chat with me in plain English or Pidgin whatever flows best for you. If you want, I can also drop you a quick reminder the day before each market day.\n\nTry asking me something like:\n• _"When is the next market day?"_\n• _"Set a reminder for market days"_ \n• _"When is the first market day in August?"_\n\nHow can I help you today? 🛒`,
        { parse_mode: "Markdown" }
    );
});

bot.command("remind", (ctx) => {
    const chatId = ctx.chat.id.toString();
    const firstName = getFirstName(ctx);
    const subscribers = loadSubscribers();

    if (subscribers[chatId]) {
        ctx.reply(`You're already set up for reminders, ${firstName}. I'll ping you the day before and on every market day.`);
    } else {
        subscribers[chatId] = { firstName, chatId };
        saveSubscribers(subscribers);
        ctx.reply(`Done! I'll remind you the day before and on the morning of every Itam market day, ${firstName}. 🎉`);
    }
});

bot.command("stopremind", (ctx) => {
    const chatId = ctx.chat.id.toString();
    const firstName = getFirstName(ctx);
    const subscribers = loadSubscribers();

    if (subscribers[chatId]) {
        delete subscribers[chatId];
        saveSubscribers(subscribers);
        ctx.reply(`Reminders turned off, ${firstName}. Come back anytime if you change your mind.`);
    } else {
        ctx.reply(`You don't have any reminders set up yet. Send /remind if you'd like to get started.`);
    }
});

// ─── All other messages → LLM ─────────────────────────────────────────────────

bot.on("text", async (ctx) => {
    const firstName = getFirstName(ctx);
    const chatId = ctx.chat.id.toString();
    const text = ctx.message.text;

    // Add user message to history
    addToHistory(chatId, "user", text);

    try {
        await ctx.sendChatAction("typing");
        const history = getHistory(chatId);
        const { reply, action } = await askLLM(history, firstName);

        // Add bot reply to history
        addToHistory(chatId, "assistant", reply);

        // Handle reminder actions
        const subscribers = loadSubscribers();
        if (action === "REMIND" && !subscribers[chatId]) {
            subscribers[chatId] = { firstName, chatId };
            saveSubscribers(subscribers);
        } else if (action === "STOPREMIND" && subscribers[chatId]) {
            delete subscribers[chatId];
            saveSubscribers(subscribers);
        }

        ctx.reply(reply);
    } catch (err) {
        console.error("LLM error:", err.message);
        ctx.reply(`Something went wrong, ${firstName}. Try again in a moment.`);
    }
});

// ─── Daily Reminder Scheduler ─────────────────────────────────────────────────

cron.schedule("0 7 * * *", () => {
    const subscribers = loadSubscribers();
    const info = getMarketDayInfo();

    let reminderMessage = null;

    if (info.daysAway === 0) {
        reminderMessage = `🛒 Good morning! Today is Itam market day — *${info.formatted}*. Don't forget to head out!`;
    } else if (info.daysAway === 1) {
        reminderMessage = `📅 Heads up — Itam market day is tomorrow, *${info.formatted}*. Plan ahead so you don't miss it!`;
    }

    if (reminderMessage) {
        Object.values(subscribers).forEach(({ chatId, firstName }) => {
            bot.telegram
                .sendMessage(chatId, `Hey ${firstName}! ` + reminderMessage, { parse_mode: "Markdown" })
                .catch((err) => console.error(`Failed to message ${firstName}:`, err.message));
        });
    }
}, {
    timezone: "Africa/Lagos"
});

// ─── Launch ───────────────────────────────────────────────────────────────────

bot.launch();
console.log("🟢 Itam Market Bot is running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));