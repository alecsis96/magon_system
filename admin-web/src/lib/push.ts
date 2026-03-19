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

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(messages),
  })

  if (!response.ok) {
    throw new Error(`Expo Push API responded with ${response.status}`)
  }

  return {
    delivered: true,
    reason: "sent",
  }
}
