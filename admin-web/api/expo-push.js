const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

async function validateSessionToken(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase server env missing for push proxy")
  }

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!userResponse.ok) {
    return { ok: false, status: 401, error: "Sesion invalida o expirada" }
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

  const sessionValidation = await validateSessionToken(accessToken)

  if (!sessionValidation.ok) {
    return res.status(sessionValidation.status).json({ error: sessionValidation.error })
  }

  const { messages } = req.body ?? {}

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "No push messages provided" })
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
