function systemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function partsFor(date = new Date(), timeZone = systemTimeZone()) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}${parts.minute}`,
    timeZone,
  };
}

function localDate(date = new Date(), timeZone = systemTimeZone()) {
  return partsFor(date, timeZone).date;
}

module.exports = {
  localDate,
};
