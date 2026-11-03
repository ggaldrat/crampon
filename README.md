# Crampon

An AI assistant that runs entirely on your Android phone. On first launch it picks and installs the best model your phone can run, then keeps the model and itself up to date. No account, no cloud.

Crampon is a fork of [PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai) by Asghar Ghorbani (MIT license), built on [llama.rn](https://github.com/mybigday/llama.rn) and [llama.cpp](https://github.com/ggml-org/llama.cpp). It strips PocketPal down to a single chat screen, chooses the model for you and adds a few on-device tools (date, calculator, Wikipedia, page reading).

## Install

Download `crampon.apk` from the [latest release](https://github.com/ggaldrat/crampon/releases/latest) and open it on the phone (Android asks to allow installs from your browser once). Later versions install themselves.

Status: test version, arm64 Android phones only. Not on the Play Store.

## How it is built

Every change to `main` is tested, built, signed and published by [`.github/workflows/crampon-release.yml`](.github/workflows/crampon-release.yml). The release carries `crampon.apk` and `version.json` (`versionCode`, `url`, `sha256`), which the app reads to update itself.

Local build: `yarn install`, then in `android/`: `./gradlew assembleProdRelease`. Release signing reads `~/crampon/keys/signing.properties` (or the file named by `CRAMPON_SIGNING`), and falls back to the debug key without it.

## License

MIT, see [LICENSE](LICENSE).
