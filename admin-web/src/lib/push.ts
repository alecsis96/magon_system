import { supabase } from "./supabase"

type PushPayload = {
  title: string
  body: string
  data?: Record<string, string | number | boolean | null>
}

type PushTokenRow = {
  expo_push_token: string
}

export async function sendDispatchPushNotification(payload: PushPayload) {
  const { data, error } = await supabase
    .from("repartidor_push_tokens")
    .select("expo_push_token")
    .eq("activo", true)

  if (error) {
    throw error
  }

  const tokens = ((data ?? []) as PushTokenRow[])
    .map((row) => row.expo_push_token)
    .filter(Boolean)

  if (tokens.length === 0) {
    return {
      delivered: false,
      reason: "no_tokens",
    }
  }

  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }))

  const response = await fetch("/api/expo-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ messages }),
  })

  if (!response.ok) {
    let errorMessage = `Push proxy responded with ${response.status}`

    try {
      const errorPayload = (await response.json()) as { error?: string }

      if (typeof errorPayload.error === "string" && errorPayload.error.trim()) {
        errorMessage = errorPayload.error
      }
    } catch {
      // Ignore invalid JSON and keep the generic message.
    }

    throw new Error(errorMessage)
  }

  return {
    delivered: true,
    reason: "sent",
  }
}
