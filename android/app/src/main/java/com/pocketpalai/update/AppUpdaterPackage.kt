package com.pocketpal.update

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.pocketpal.specs.NativeAppUpdaterSpec

class AppUpdaterPackage : TurboReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == NativeAppUpdaterSpec.NAME) {
      AppUpdaterModule(reactContext)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        NativeAppUpdaterSpec.NAME to ReactModuleInfo(
          NativeAppUpdaterSpec.NAME,
          NativeAppUpdaterSpec.NAME,
          false, // canOverrideExistingModule
          false, // needsEagerInit
          false, // hasConstants
          false, // isCxxModule
          true   // isTurboModule
        )
      )
    }
  }
}

