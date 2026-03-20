export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ error: "Method not allowed" })
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
