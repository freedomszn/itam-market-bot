// Itam Market cycle rule:
//
// - The regular cycle advances every 8 calendar days, so the market weekday
//   normally moves forward by one weekday each cycle.
// - If the cycle date lands on Sunday, the market is observed on Monday instead.
// - After a Sunday carry-over, the underlying 8-day cycle still continues from
//   the original Sunday cycle date. That means the next cycle date is Monday,
//   then Tuesday, Wednesday, and so on.
//
// Confirmed reference:
// - Saturday, June 27, 2026 was a market day.
// - The next cycle day is Sunday, June 28, 2026, observed on Monday, June 29.

const MARKET_TIME_ZONE = "Africa/Lagos";
const MARKET_CYCLE_DAYS = 8;

const CYCLE_ANCHOR_DATE = utcDate(2026, 6, 28); // Sunday cycle date, observed on Monday June 29.
const CONFIRMED_OBSERVED_MARKET_DAYS = [utcDate(2026, 6, 27)];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toUTCDateOnly(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function getDateInMarketTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return utcDate(values.year, values.month, values.day);
}

function daysBetween(dateA, dateB) {
  const utcA = Date.UTC(
    dateA.getUTCFullYear(),
    dateA.getUTCMonth(),
    dateA.getUTCDate(),
  );

  const utcB = Date.UTC(
    dateB.getUTCFullYear(),
    dateB.getUTCMonth(),
    dateB.getUTCDate(),
  );

  return Math.round((utcB - utcA) / (24 * 60 * 60 * 1000));
}

function getCycleIndexForDate(date) {
  return Math.floor(daysBetween(CYCLE_ANCHOR_DATE, date) / MARKET_CYCLE_DAYS);
}

function getCycleDateAt(index) {
  return addDays(CYCLE_ANCHOR_DATE, index * MARKET_CYCLE_DAYS);
}

function getObservedMarketDate(cycleDate) {
  if (cycleDate.getUTCDay() === 0) {
    return addDays(cycleDate, 1);
  }

  return new Date(cycleDate);
}

function getMarketDayEntry(index) {
  const cycleDate = getCycleDateAt(index);
  const observedDate = getObservedMarketDate(cycleDate);

  return {
    cycleDate,
    observedDate,
    wasCarriedFromSunday: cycleDate.getUTCDay() === 0,
  };
}

function generateCycleMarketDayEntries(from, count = 60) {
  const days = [];
  const fromDate = from ? toUTCDateOnly(from) : CYCLE_ANCHOR_DATE;

  // Step back one cycle so a Sunday that is observed on Monday is still included
  // when `from` is that Monday. Clamp to the anchor so we do not invent older
  // recurring dates before the confirmed June 2026 reference point.
  let index = Math.max(getCycleIndexForDate(fromDate) - 1, 0);

  while (days.length < count) {
    const entry = getMarketDayEntry(index);

    if (daysBetween(fromDate, entry.observedDate) >= 0) {
      days.push(entry);
    }

    index += 1;
  }

  return days;
}

/**
 * Build a list of observed market days on or after `from`.
 *
 * Sunday cycle dates are carried over to Monday, but the next cycle still starts
 * from the underlying Sunday date. That produces sequences like:
 * Saturday -> Sunday carried to Monday -> Monday -> Tuesday -> Wednesday...
 */
function generateMarketDayEntries(from, count = 60) {
  const fromDate = from ? toUTCDateOnly(from) : CYCLE_ANCHOR_DATE;

  const confirmedEntries = CONFIRMED_OBSERVED_MARKET_DAYS.filter(
    (date) => daysBetween(fromDate, date) >= 0,
  ).map((date) => ({
    cycleDate: date,
    observedDate: date,
    wasCarriedFromSunday: false,
  }));

  const cycleEntries = generateCycleMarketDayEntries(
    fromDate,
    count + confirmedEntries.length,
  );

  return [...confirmedEntries, ...cycleEntries]
    .sort((a, b) => a.observedDate - b.observedDate)
    .filter(
      (entry, index, all) =>
        index === 0 ||
        daysBetween(all[index - 1].observedDate, entry.observedDate) !== 0,
    )
    .slice(0, count);
}

function generateMarketDays(from, count = 60) {
  return generateMarketDayEntries(from, count).map(
    (entry) => entry.observedDate,
  );
}

function formatMarketDate(date) {
  return date.toLocaleDateString("en-NG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function getMarketDayInfo(today = new Date()) {
  const todayDate = getDateInMarketTimeZone(today);
  const [nextEntry] = generateMarketDayEntries(todayDate, 1);
  const nextMarketDay = nextEntry.observedDate;
  const daysAway = daysBetween(todayDate, nextMarketDay);
  const formatted = formatMarketDate(nextMarketDay);

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
    cycleDate: nextEntry.cycleDate,
    daysAway,
    formatted,
    message,
    dayName: DAY_NAMES[nextMarketDay.getUTCDay()],
    wasCarriedFromSunday: nextEntry.wasCarriedFromSunday,
  };
}

function getUpcomingMarketDays(count = 10) {
  const todayDate = getDateInMarketTimeZone();

  return generateMarketDayEntries(todayDate, count).map((entry) => ({
    date: entry.observedDate,
    cycleDate: entry.cycleDate,
    formatted: formatMarketDate(entry.observedDate),
    daysAway: daysBetween(todayDate, entry.observedDate),
    dayName: DAY_NAMES[entry.observedDate.getUTCDay()],
    wasCarriedFromSunday: entry.wasCarriedFromSunday,
  }));
}

module.exports = {
  getMarketDayInfo,
  getUpcomingMarketDays,
  generateMarketDays,
  daysBetween,
};
