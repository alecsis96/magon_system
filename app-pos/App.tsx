import { StatusBar } from "expo-status-bar"
import * as Linking from "expo-linking"
import { SafeAreaView } from "react-native-safe-area-context"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { WebView } from "react-native-webview"
import { useMemo, useRef, useState } from "react"
import { buildInjectedBridgeScript } from "./src/bridge/injected-bridge"
import { DEFAULT_ADMIN_WEB_URL, normalizeAdminWebUrl } from "./src/config/admin-url"
import {
  bridgeCanHandleMessage,
  parseBridgeMessage,
  type BridgeMessage,
} from "./src/bridge/messages"
import { printTicket } from "./src/printing/print-ticket"

export default function App() {
  const webViewRef = useRef<WebView>(null)
  const [urlInput, setUrlInput] = useState(DEFAULT_ADMIN_WEB_URL)
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_ADMIN_WEB_URL)
  const [statusText, setStatusText] = useState("Listo")
  const [isLoading, setIsLoading] = useState(false)

  const injectedBridgeScript = useMemo(() => buildInjectedBridgeScript(), [])

  async function handleBridgeMessage(message: BridgeMessage) {
    switch (message.type) {
      case "print_ticket":
        setStatusText("Imprimiendo ticket...")

        try {
          await printTicket(message.payload.text)
          setStatusText("Ticket enviado a impresion")
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : "Error desconocido"
          setStatusText(`Impresion pendiente: ${reason}`)
        }
        break
      case "open_external_url":
        setStatusText("Abriendo enlace externo...")
        await Linking.openURL(message.payload.url)
        break
      case "bridge_ready":
        setStatusText("Bridge conectado")
        break
      default:
        setStatusText("Mensaje recibido")
        break
    }
  }

  function handleLoadUrl() {
    const normalizedUrl = normalizeAdminWebUrl(urlInput)
    setCurrentUrl(normalizedUrl)
    setUrlInput(normalizedUrl)
    setStatusText("Cargando POS...")
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.title}>Magon POS</Text>
          <Text style={styles.subtitle}>{statusText}</Text>
        </View>
        <Pressable
          onPress={() => webViewRef.current?.reload()}
          style={styles.actionButton}
        >
          <Text style={styles.actionButtonText}>Recargar</Text>
        </Pressable>
      </View>

      <View style={styles.urlBar}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setUrlInput}
          onSubmitEditing={handleLoadUrl}
          placeholder="https://tu-pos.vercel.app"
          style={styles.urlInput}
          value={urlInput}
        />
        <Pressable onPress={handleLoadUrl} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Abrir</Text>
        </Pressable>
      </View>

      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          originWhitelist={["*"]}
          injectedJavaScriptBeforeContentLoaded={injectedBridgeScript}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onMessage={(event) => {
            const rawData = event.nativeEvent.data

            if (!bridgeCanHandleMessage(rawData)) {
              setStatusText("Mensaje ignorado")
              return
            }

            const message = parseBridgeMessage(rawData)

            if (!message) {
              setStatusText("Mensaje invalido")
              return
            }

            void handleBridgeMessage(message)
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (
              request.url.startsWith("http://") ||
              request.url.startsWith("https://")
            ) {
              return true
            }

            setStatusText("Bloqueado: esquema no permitido")
            return false
          }}
        />
        {isLoading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#0f172a" size="small" />
            <Text style={styles.loadingText}>Cargando...</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTextBlock: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#475569",
  },
  actionButton: {
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  urlBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  urlInput: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: "#0f172a",
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  webViewContainer: {
    flex: 1,
    overflow: "hidden",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  loadingOverlay: {
    position: "absolute",
    right: 16,
    top: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
})
