const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const MAX_MESSAGES_PER_REQUEST = 100
const MAX_REQUESTS_PER_MINUTE = 20
const RATE_LIMIT_WINDOW_MS = 60_000
const requestCounters = new Map()

function getRateLimitKey(req, accessToken) {
  const forwardedFor = req.headers["x-forwarded-for"]
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || req.socket?.remoteAddress || "unknown")

  return `${ip}:${accessToken.slice(0, 12)}`
}

function isRateLimited(key) {
  const now = Date.now()
  const current = requestCounters.get(key)

  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounters.set(key, { count: 1, windowStart: now })
    return false
  }

  if (current.count >= MAX_REQUESTS_PER_MINUTE) {
    return true
  }

  current.count += 1
  requestCounters.set(key, current)
  return false
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "No push messages provided"
  }

  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return `Too many push messages. Max allowed is ${MAX_MESSAGES_PER_REQUEST}`
  }

  for (const message of messages) {
    if (!message || typeof message !== "object") {
      return "Invalid push message payload"
    }

    if (typeof message.to !== "string" || !message.to.startsWith("ExponentPushToken[")) {
      return "Invalid Expo push token format"
    }

    if (typeof message.title !== "string" || message.title.trim().length === 0) {
      return "Push message title is required"
    }

    if (typeof message.body !== "string" || message.body.trim().length === 0) {
      return "Push message body is required"
    }

    if (message.data !== undefined && (message.data === null || typeof message.data !== "object")) {
      return "Push message data must be an object"
    }
  }

  return null
}

async function validateAdminSession(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase server env missing for push proxy")
  }

  const adminCheckResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/es_usuario_admin`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  })

  if (!adminCheckResponse.ok) {
    return { ok: false, status: 401, error: "Sesion invalida o expirada" }
  }

  const responseText = await adminCheckResponse.text()
  let isAdmin = false

  try {
    isAdmin = Boolean(responseText ? JSON.parse(responseText) : false)
  } catch {
    return { ok: false, status: 500, error: "No se pudo validar permisos de administrador" }
  }

  if (!isAdmin) {
    return { ok: false, status: 403, error: "Solo administradores pueden enviar notificaciones" }
  }

  return { ok: true }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ error: "Method not allowed" })
  }

  const authorization = req.headers.authorization || ""
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : ""

  if (!accessToken) {
    return res.status(401).json({ error: "Missing session token" })
  }

  const rateLimitKey = getRateLimitKey(req, accessToken)

  if (isRateLimited(rateLimitKey)) {
    return res.status(429).json({ error: "Too many requests. Try again in a minute" })
  }

  const sessionValidation = await validateAdminSession(accessToken)

  if (!sessionValidation.ok) {
    return res.status(sessionValidation.status).json({ error: sessionValidation.error })
  }

  const { messages } = req.body ?? {}
  const messageValidationError = validateMessages(messages)

  if (messageValidationError) {
    return res.status(400).json({ error: messageValidationError })
  }

  try {
    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    })

    const responseText = await expoResponse.text()

    if (!expoResponse.ok) {
      return res.status(expoResponse.status).json({
        error: responseText || `Expo Push API responded with ${expoResponse.status}`,
      })
    }

    let parsedBody = null

    try {
      parsedBody = responseText ? JSON.parse(responseText) : null
    } catch {
      parsedBody = { raw: responseText }
    }

    return res.status(200).json({
      ok: true,
      expo: parsedBody,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error sending push notification"

    return res.status(500).json({ error: message })
  }
}
