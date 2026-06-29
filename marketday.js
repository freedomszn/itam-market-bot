// Anchor: we know June 19, 2026 (Friday) is a confirmed market day
const ANCHOR_DATE = new Date("2026-06-19T00:00:00.000Z");
const MARKET_CYCLE_DAYS = 8; // Itam market follows an 8-day traditional cycle

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function daysBetween(dateA, dateB) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const utcA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const utcB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((utcB - utcA) / msPerDay);
}

/**
 * Build a list of market days on or after 'from'.
 * Always iterates forward from ANCHOR_DATE to maintain the correct 8-day
 * market phase, collecting only days >= 'from'. This works correctly
 * for any date in the future with no expiry.
 */
function generateMarketDays(from, count = 60) {
  const days = [];
  let current = new Date(ANCHOR_DATE);
  let prevWasSundayShift = false;

  // Check the anchor itself
  if (!from || daysBetween(from, current) >= 0) {
    days.push(new Date(current));
  }

  while (days.length < count) {
    let next = new Date(current);
    next.setUTCDate(next.getUTCDate() + MARKET_CYCLE_DAYS);

    const dayOfWeek = next.getUTCDay();

    if (dayOfWeek === 0) {
      // Falls on Sunday — shift to Monday
      next.setUTCDate(next.getUTCDate() + 1);
      prevWasSundayShift = true;
    } else if (prevWasSundayShift) {
      // Previous cycle was a Sunday→Monday shift;
      // keep this cycle on Monday too (7-day gap instead of 8)
      next = new Date(current);
      next.setUTCDate(next.getUTCDate() + 7);
      prevWasSundayShift = false;
    } else {
      prevWasSundayShift = false;
    }

    if (!from || daysBetween(from, next) >= 0) {
      days.push(new Date(next));
    }
    current = next;
  }

  return days;
}

function getMarketDayInfo(today = new Date()) {
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  const marketDays = generateMarketDays(todayUTC);

  // Find the first market day that is today or in the future
  const nextMarketDay = marketDays.find((d) => daysBetween(todayUTC, d) >= 0);

  const daysAway = daysBetween(todayUTC, nextMarketDay);

  const formatted = nextMarketDay.toLocaleDateString("en-NG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  let message;
  if (daysAway === 0) {
    message = `Today is Itam market day! 🎉 (${formatted})`;
  } else if (daysAway === 1) {
    message = `Itam market day is tomorrow — ${formatted} 🛒`;
  } else {
    message = `The next Itam market day is ${formatted}, which is ${daysAway} days away.`;
  }

  return {
    date: nextMarketDay,
    daysAway,
    formatted,
    message,
    dayName: DAY_NAMES[nextMarketDay.getUTCDay()],
  };
}

function getUpcomingMarketDays(count = 10) {
  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );

  const allDays = generateMarketDays(todayUTC, 60);

  return allDays
    .filter((d) => daysBetween(todayUTC, d) >= 0)
    .slice(0, count)
    .map((d) => ({
      formatted: d.toLocaleDateString("en-NG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }),
      daysAway: daysBetween(todayUTC, d),
    }));
}

module.exports = {
  getMarketDayInfo,
  getUpcomingMarketDays,
  generateMarketDays,
  daysBetween,
};
