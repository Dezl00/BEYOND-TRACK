# BEYOND TRACK Android

From apps/mobile run flutter pub get and flutter run. The Android application ID is online.beyondtrack.app. The default HTTPS API is https://www.beyond-track.online. To use a staging deployment pass --dart-define=TRACK_API_ORIGIN=https://your-staging-host when running Flutter. Deploy the mobile API routes to that host before signing in.

## Distribution

Create an independent BEYOND TRACK Android app in Shorebird and set its UUID as the GitHub Actions repository variable SHOREBIRD_APP_ID. The manual workflow track-android.yml creates shorebird.yaml for the release build. Use the same UUID for subsequent patches. Set the Actions secrets SHOREBIRD_TOKEN (release and patch scope), ANDROID_KEYSTORE_BASE64 (base64 upload keystore), ANDROID_STORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD. Preserve the signing key for future installations. Run release for the first installable APK. Run patch against its exact installed version for Dart updates. Changes to native Android code require a new full release. Firebase server credentials belong in the server environment.
