package com.pocketpal.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log

/** Receives the outcome of an install session committed by AppUpdaterModule. */
class InstallResultReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val status = intent.getIntExtra(
        PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    when (status) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        // Not yet our own installer of record: Android asks once.
        val confirm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(Intent.EXTRA_INTENT)
        }
        confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          confirm?.let { context.startActivity(it) }
        } catch (e: Exception) {
          remember(context, "confirmation not shown: ${e.message}")
        }
      }
      PackageInstaller.STATUS_SUCCESS -> Log.i(TAG, "update installed")
      else -> {
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        remember(context, "status $status: $message")
      }
    }
  }

  companion object {
    private const val TAG = "AppUpdater"
    private const val PREFS = "app_updater"
    private const val KEY_ERROR = "last_error"

    private fun remember(context: Context, error: String) {
      Log.w(TAG, error)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          .edit().putString(KEY_ERROR, error).apply()
    }

    fun takeLastError(context: Context): String? {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val error = prefs.getString(KEY_ERROR, null)
      prefs.edit().remove(KEY_ERROR).apply()
      return error
    }
  }
}
