const DEFAULT_LOCALE = "es-MX"
const DEFAULT_TIME_ZONE = "America/Mexico_City"

const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ISO_NAIVE_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/
const POSTGRES_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:\s*(Z|[+-]\d{2}(?::?\d{2})?))?$/i

type DateInput = Date | string | number | null | undefined

type ParseDateTimeOptions = {
  assumeUtcForNaive?: boolean
}

type FormatDateTimeOptions = {
  dateStyle?: "full" | "long" | "medium" | "short"
  fallback?: string
  timeStyle?: "full" | "long" | "medium" | "short"
  timeZone?: string
}

type DateKeyOptions = ParseDateTimeOptions & {
  timeZone?: string
}

type FormatDateKeyOptions = {
  timeZone?: string
}

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime())
}

function parseNaiveDateTime(value: string, assumeUtcForNaive: boolean) {
  const match = ISO_NAIVE_DATE_TIME_PATTERN.exec(value)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const fraction = match[7] ?? ""
  const milliseconds = fraction ? Number(fraction.slice(0, 3).padEnd(3, "0")) : 0

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    !Number.isInteger(milliseconds)
  ) {
    return null
  }

  const parsed = assumeUtcForNaive
    ? new Date(Date.UTC(year, month - 1, day, hour, minute, second, milliseconds))
    : new Date(year, month - 1, day, hour, minute, second, milliseconds)

  if (!isValidDate(parsed)) {
    return null
  }

  const parsedYear = assumeUtcForNaive ? parsed.getUTCFullYear() : parsed.getFullYear()
  const parsedMonth = assumeUtcForNaive ? parsed.getUTCMonth() + 1 : parsed.getMonth() + 1
  const parsedDay = assumeUtcForNaive ? parsed.getUTCDate() : parsed.getDate()
  const parsedHour = assumeUtcForNaive ? parsed.getUTCHours() : parsed.getHours()
  const parsedMinute = assumeUtcForNaive ? parsed.getUTCMinutes() : parsed.getMinutes()
  const parsedSecond = assumeUtcForNaive ? parsed.getUTCSeconds() : parsed.getSeconds()

  if (
    parsedYear !== year ||
    parsedMonth !== month ||
    parsedDay !== day ||
    parsedHour !== hour ||
    parsedMinute !== minute ||
    parsedSecond !== second
  ) {
    return null
  }

  return parsed
}

function normalizeOffset(value: string) {
  if (value.toUpperCase() === "Z") {
    return "Z"
  }

  const match = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(value)

  if (!match) {
    return null
  }

  const sign = match[1]
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? "00")

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null
  }

  return `${sign}${match[2]}:${(match[3] ?? "00").padStart(2, "0")}`
}

function parsePostgresDateTime(value: string, assumeUtcForNaive: boolean) {
  const match = POSTGRES_DATE_TIME_PATTERN.exec(value)

  if (!match) {
    return null
  }

  const [, year, month, day, hour, minute, second, fraction = "", offsetRaw] = match
  const milliseconds = fraction ? fraction.slice(0, 3).padEnd(3, "0") : "000"

  if (!offsetRaw) {
    return parseNaiveDateTime(
      `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ? `.${fraction}` : ""}`,
      assumeUtcForNaive,
    )
  }

  const normalizedOffset = normalizeOffset(offsetRaw)

  if (!normalizedOffset) {
    return null
  }

  const parsed = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}${normalizedOffset === "Z" ? "Z" : normalizedOffset}`,
  )

  return isValidDate(parsed) ? parsed : null
}

function normalizeInputDate(value: DateInput) {
  if (value == null) {
    return null
  }

  if (value instanceof Date) {
    return isValidDate(value) ? new Date(value.getTime()) : null
  }

  if (typeof value === "number") {
    const parsed = new Date(value)
    return isValidDate(parsed) ? parsed : null
  }

  const normalized = value.trim()
  return normalized || null
}

function buildDateKeyFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  })
}

function formatToDateKey(date: Date, timeZone: string) {
  const formatter = buildDateKeyFormatter(timeZone)
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  if (!year || !month || !day) {
    return ""
  }

  return `${year}-${month}-${day}`
}

export function parseDateTime(
  value: DateInput,
  options: ParseDateTimeOptions = {},
) {
  const normalized = normalizeInputDate(value)

  if (!normalized) {
    return null
  }

  if (normalized instanceof Date) {
    return normalized
  }

  if (ISO_DATE_ONLY_PATTERN.test(normalized)) {
    const parsedDateOnly = new Date(`${normalized}T00:00:00`)
    return isValidDate(parsedDateOnly) ? parsedDateOnly : null
  }

  const { assumeUtcForNaive = true } = options
  const parsedPostgresDateTime = parsePostgresDateTime(normalized, assumeUtcForNaive)

  if (parsedPostgresDateTime) {
    return parsedPostgresDateTime
  }

  const parsed = new Date(normalized)

  return isValidDate(parsed) ? parsed : null
}

export function formatDateTime(
  value: DateInput,
  options: FormatDateTimeOptions = {},
) {
  const {
    dateStyle = "medium",
    fallback = "",
    timeStyle = "short",
    timeZone = DEFAULT_TIME_ZONE,
  } = options

  const parsed = parseDateTime(value)

  if (!parsed) {
    return fallback
  }

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    dateStyle,
    timeStyle,
    timeZone,
  }).format(parsed)
}

export function toDateKey(value: DateInput, options: DateKeyOptions = {}) {
  const { assumeUtcForNaive = true, timeZone = DEFAULT_TIME_ZONE } = options
  const parsed = parseDateTime(value, { assumeUtcForNaive })

  if (!parsed) {
    return ""
  }

  return formatToDateKey(parsed, timeZone)
}

export function getTodayDateKey(options: FormatDateKeyOptions = {}) {
  const { timeZone = DEFAULT_TIME_ZONE } = options
  return formatToDateKey(new Date(), timeZone)
}

export function formatDateKey(value: string, options: FormatDateKeyOptions = {}) {
  if (!ISO_DATE_ONLY_PATTERN.test(value)) {
    return value
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return value
  }

  const parsed = new Date(Date.UTC(year, month - 1, day, 12))

  if (!parsed) {
    return value
  }

  if (!isValidDate(parsed)) {
    return value
  }

  const { timeZone = "UTC" } = options

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "2-digit",
    month: "short",
    timeZone,
    year: "numeric",
  }).format(parsed)
}

export function formatMonthKey(value: string, options: FormatDateKeyOptions = {}) {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return value
  }

  const parsed = new Date(Date.UTC(year, month - 1, 1))

  if (!isValidDate(parsed)) {
    return value
  }

  const { timeZone = "UTC" } = options

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    month: "long",
    timeZone,
    year: "numeric",
  }).format(parsed)
}
