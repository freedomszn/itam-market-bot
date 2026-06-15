require("dotenv").config();

const { Telegraf } = require("telegraf");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const { askLLM } = require("./llm");
const { getMarketDayInfo } = require("./marketday");

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

const SUBSCRIBERS_FILE = path.join(__dirname, "subscribers.json");

// 
function getFirstName(ctx) {
    const full = ctx.from.first_name || "friend";
    return full.split(" ")[0];
}

// ─── Subscriber Helpers ───────────────────────────────────────────────────────

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

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.start((ctx) => {
    const firstName = getFirstName(ctx);
    ctx.reply(
        `Hi ${firstName}!👋 \n\nI'm here to help you keep track of Itam Market days so you don't miss anyone.\n\nJust ask me when the next market day is, or use /remind to get automatic reminders before every market day.`
    );
});

bot.command("remind", (ctx) => {
    const chatId = ctx.chat.id.toString();
    const firstName = getFirstName(ctx);
    const subscribers = loadSubscribers();

    if (subscribers[chatId]) {
        ctx.reply(`${firstName}, you're already set up for reminders! I'll ping you the day before and on every market day. 🛒`);
    } else {
        subscribers[chatId] = { firstName, chatId };
        saveSubscribers(subscribers);
        ctx.reply(`Done ${firstName}! 🎉 I'll remind you the evening before and on the morning of every Itam market day.`);
    }
});

bot.command("stopremind", (ctx) => {
    const chatId = ctx.chat.id.toString();
    const firstName = getFirstName(ctx);
    const subscribers = loadSubscribers();

    if (subscribers[chatId]) {
        delete subscribers[chatId];
        saveSubscribers(subscribers);
        ctx.reply(`Okay ${firstName}, I've turned off your market day reminders. You can always turn them back on with /remind.`);
    } else {
        ctx.reply(`You don't have any reminders set up yet, ${firstName}. Use /remind to get started.`);
    }
});

// ─── All other messages → LLM ─────────────────────────────────────────────────

bot.on("text", async (ctx) => {
    const firstName = getFirstName(ctx);
    const chatId = ctx.chat.id.toString();
    const text = ctx.message.text;

    try {
        await ctx.sendChatAction("typing");
        const { reply, action } = await askLLM(text, firstName);

        if (action === "REMIND") {
            const subscribers = loadSubscribers();
            if (!subscribers[chatId]) {
                subscribers[chatId] = { firstName, chatId };
                saveSubscribers(subscribers);
            }
        } else if (action === "STOPREMIND") {
            const subscribers = loadSubscribers();
            if (subscribers[chatId]) {
                delete subscribers[chatId];
                saveSubscribers(subscribers);
            }
        }

        ctx.reply(reply);
    } catch (err) {
        console.error("LLM error:", err.message);
        ctx.reply(`Sorry ${firstName}, something went wrong. Try again in a moment.`);
    }
});

// ─── Daily Reminder Scheduler ─────────────────────────────────────────────────
// Runs every day at 8:00 AM Nigeria time (Africa/Lagos = UTC+1)

cron.schedule("0 7 * * *", () => {
    const subscribers = loadSubscribers();
    const info = getMarketDayInfo();

    let reminderMessage = null;

    if (info.daysAway === 0) {
        reminderMessage = `🛒 Today is Itam market day — ${info.formatted}. Don't forget to head out!`;
    } else if (info.daysAway === 1) {
        reminderMessage = `📅 Just a heads up — Itam market day is tomorrow, ${info.formatted}. Plan ahead!`;
    }

    if (reminderMessage) {
        Object.values(subscribers).forEach(({ chatId, firstName }) => {
            bot.telegram
                .sendMessage(chatId, `Hey ${firstName}! ` + reminderMessage)
                .catch((err) => console.error(`Failed to message ${firstName}:`, err.message));
        });
    }
}, {
    timezone: "Africa/Lagos"
});

// ─── Launch ───────────────────────────────────────────────────────────────────

bot.launch();
console.log("🟢 Itam Market Bot is running...");

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));