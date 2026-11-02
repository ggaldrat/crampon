package com.pocketpal.update

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeAppUpdaterSpec
import java.io.File

/**
 * Lets Crampon replace itself with a newer APK. Once Crampon has installed
 * one update itself, it is its own installer of record and Android 12+
 * applies the following ones without asking (USER_ACTION_NOT_REQUIRED).
 */
@ReactModule(name = NativeAppUpdaterSpec.NAME)
class AppUpdaterModule(reactContext: ReactApplicationContext) :
    NativeAppUpdaterSpec(reactContext) {

  override fun getInfo(promise: Promise) {
    try {
      val context = reactApplicationContext
      val pm = context.packageManager
      val info = pm.getPackageInfo(context.packageName, 0)
      val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        pm.getInstallSourceInfo(context.packageName).installingPackageName
      } else {
        @Suppress("DEPRECATION")
        pm.getInstallerPackageName(context.packageName)
      }
      val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.longVersionCode.toDouble()
      } else {
        @Suppress("DEPRECATION")
        info.versionCode.toDouble()
      }
      val result = Arguments.createMap()
      result.putDouble("versionCode", versionCode)
      result.putBoolean("selfInstalled", installer == context.packageName)
      promise.resolve(result)
    } catch (e: PackageManager.NameNotFoundException) {
      promise.reject("E_INFO", e)
    }
  }

  override fun install(path: String, promise: Promise) {
    try {
      val context = reactApplicationContext
      val apk = File(path)
      val installer = context.packageManager.packageInstaller
      val params = PackageInstaller.SessionParams(
          PackageInstaller.SessionParams.MODE_FULL_INSTALL)
      params.setAppPackageName(context.packageName)
      params.setSize(apk.length())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        params.setRequireUserAction(
            PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      }
      val sessionId = installer.createSession(params)
      installer.openSession(sessionId).use { session ->
        apk.inputStream().use { input ->
          session.openWrite("crampon.apk", 0, apk.length()).use { output ->
            input.copyTo(output)
            session.fsync(output)
          }
        }
        // The system fills in the status extras, so the intent must be mutable.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
        val callback = PendingIntent.getBroadcast(
            context, sessionId,
            Intent(context, InstallResultReceiver::class.java), flags)
        session.commit(callback.intentSender)
      }
      promise.resolve("committed")
    } catch (e: Exception) {
      promise.reject("E_INSTALL", e)
    }
  }

  override fun takeLastError(promise: Promise) {
    promise.resolve(InstallResultReceiver.takeLastError(reactApplicationContext))
  }
}
