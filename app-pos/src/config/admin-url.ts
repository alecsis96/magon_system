export const DEFAULT_ADMIN_WEB_URL =
  process.env.EXPO_PUBLIC_ADMIN_WEB_URL?.trim() ||
  "https://magon-pos.vercel.app"

export function normalizeAdminWebUrl(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return DEFAULT_ADMIN_WEB_URL
  }

  if (
    trimmedValue.startsWith("http://") ||
    trimmedValue.startsWith("https://")
  ) {
    return trimmedValue
  }

  return `https://${trimmedValue}`
}
