export type BridgeMessage =
  | {
      type: "print_ticket"
      payload: {
        text: string
      }
    }
  | {
      type: "open_external_url"
      payload: {
        url: string
        source?: string
      }
    }
  | {
      type: "bridge_ready"
      payload: {
        source: string
      }
    }

export function bridgeCanHandleMessage(rawData: string) {
  return rawData.startsWith("{") && rawData.includes("\"type\"")
}

export function parseBridgeMessage(rawData: string): BridgeMessage | null {
  try {
    const parsed = JSON.parse(rawData) as BridgeMessage

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}
