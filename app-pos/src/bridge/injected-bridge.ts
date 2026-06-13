export function buildInjectedBridgeScript() {
  return `
    (function() {
      function postToNative(message) {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
          return;
        }

        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }

      window.AndroidPrinter = {
        imprimirTicket: function(texto) {
          postToNative({
            type: "print_ticket",
            payload: {
              text: String(texto ?? "")
            }
          });
        }
      };

      postToNative({
        type: "bridge_ready",
        payload: {
          source: "magon_pos_wrapper"
        }
      });
    })();
    true;
  `
}
