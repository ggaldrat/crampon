package com.pocketpal.trial

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeModelTrialServiceSpec

@ReactModule(name = NativeModelTrialServiceSpec.NAME)
class ModelTrialServiceModule(reactContext: ReactApplicationContext) :
    NativeModelTrialServiceSpec(reactContext) {

  override fun start(text: String) {
    try {
      ModelTrialService.start(reactApplicationContext, text)
    } catch (e: Exception) {
      // Android refuses a start from the background: the trial still runs
      // while the app is open, and the next start from the foreground works
      android.util.Log.w(NativeModelTrialServiceSpec.NAME, "ModelTrialService not started", e)
    }
  }

  override fun stop() {
    ModelTrialService.stop(reactApplicationContext)
  }
}
