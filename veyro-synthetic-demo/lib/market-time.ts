const newYorkDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const newYorkClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function marketDay(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "" : newYorkDateFormatter.format(timestamp);
}

export function newYorkClock(value = new Date()) {
  const parts = Object.fromEntries(newYorkClockFormatter
    .formatToParts(value)
    .map((part) => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { weekday: parts.weekday, minutes };
}

export function regularSessionQuote(value: Date) {
  const { weekday, minutes } = newYorkClock(value);
  return (
    ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday) &&
    minutes >= 570 &&
    minutes <= 960
  );
}

export function snapshotTime(snapshot: { marketAsOf?: string; capturedAt: string }) {
  return new Date(snapshot.marketAsOf || snapshot.capturedAt).getTime();
}
