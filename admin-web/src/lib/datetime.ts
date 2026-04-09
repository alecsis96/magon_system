const DEFAULT_LOCALE = "es-MX"
const DEFAULT_TIME_ZONE = "America/Mexico_City"

const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIME_ZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i

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
  const hasTimeZone = ISO_TIME_ZONE_PATTERN.test(normalized)
  const parsed = new Date(
    !hasTimeZone && assumeUtcForNaive ? `${normalized}Z` : normalized,
  )

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
