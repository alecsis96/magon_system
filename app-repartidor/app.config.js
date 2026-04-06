const path = require("path")
const appJson = require("./app.json")

module.exports = () => {
  const expo = appJson.expo

  return {
    ...expo,
    android: {
      ...expo.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ||
        path.resolve(__dirname, "google-services.json"),
    },
  }
}
