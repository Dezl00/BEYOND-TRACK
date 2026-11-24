package online.beyondtrack.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.KeyguardManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var saveResult: MethodChannel.Result? = null
    private var saveBytes: ByteArray? = null
    private var fileSelection: MethodChannel.Result? = null
    private var captureUri: Uri? = null
    private var pending: MethodChannel.Result? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "BEYOND TRACK", NotificationManager.IMPORTANCE_HIGH)
            channel.setSound(soundUri(), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build())
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private val channelId = "track_updates_v1"

    private fun soundUri(): Uri {
        // Keep the resource name stable across application upgrades.
        val name = resources.getResourceEntryName(R.raw.track_notification)
        return Uri.parse("android.resource://$packageName/raw/$name")
    }

    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger, "online.beyondtrack.app/device")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "notificationSettings" -> {
                        val settings = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName)
                        } else {
                            Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                        }
                        startActivity(settings)
                        result.success(null)
                        return@setMethodCallHandler
                    }
                    "saveFile" -> {
                        if(saveResult != null){result.error("busy","File picker is active",null); return@setMethodCallHandler}
                        saveBytes=call.argument<ByteArray>("bytes")
                        saveResult=result
                        try {
                            startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                                addCategory(Intent.CATEGORY_OPENABLE)
                                type=call.argument<String>("mime")
                                putExtra(Intent.EXTRA_TITLE,call.argument<String>("name"))
                            },7513)
                        } catch(e:Exception){saveResult=null;saveBytes=null;result.error("save",e.message,null)}
                        return@setMethodCallHandler
                    }
                    "printDocument" -> {
                        val title=call.argument<String>("title") ?: "BEYOND TRACK"
                        try {
                            val adapter=TrackPrintAdapter(title,call.argument<String>("text").orEmpty(),call.argument<Boolean>("rtl")==true){result.success(null)}
                            (getSystemService(Context.PRINT_SERVICE) as android.print.PrintManager).print(title,adapter,null)
                        } catch(e:Exception){result.error("print",e.message,null)}
                        return@setMethodCallHandler
                    }
                    "pickFiles" -> {
                        if (fileSelection != null) { result.success(emptyList<String>()); return@setMethodCallHandler }
                        fileSelection = result
                        val types = call.argument<List<String>>("accept").orEmpty().filter { it.contains('/') }
                        val picker = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = types.singleOrNull() ?: "*/*"
                            if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
                            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.argument<Boolean>("multiple") == true)
                        }
                        try {
                            if (call.argument<Boolean>("capture") == true) {
                                val folder = java.io.File(cacheDir, "captures").apply { mkdirs() }
                                val photo = java.io.File.createTempFile("track-", ".jpg", folder)
                                captureUri = androidx.core.content.FileProvider.getUriForFile(this, "$packageName.captures", photo)
                                val camera = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).apply {
                                    putExtra(android.provider.MediaStore.EXTRA_OUTPUT, captureUri)
                                    addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                try { startActivityForResult(camera, 7512) }
                                catch (_: android.content.ActivityNotFoundException) { captureUri = null; startActivityForResult(picker, 7512) }
                            } else startActivityForResult(picker, 7512)
                        } catch (_: Exception) {
                            captureUri = null
                            fileSelection = null
                            result.success(emptyList<String>())
                        }
                        return@setMethodCallHandler
                    }
                    "openAttachment" -> {
                        val uri = Uri.parse(call.argument<String>("url").orEmpty())
                        if (uri.scheme == "https" && uri.host == "res.cloudinary.com") {
                            try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: android.content.ActivityNotFoundException) {}
                        }
                        result.success(null)
                        return@setMethodCallHandler
                    }
                    "foregroundTone" -> {
                        val manager = getSystemService(NotificationManager::class.java)
                        val sound = if (Build.VERSION.SDK_INT >= 26) manager?.getNotificationChannel(channelId)?.takeIf { it.importance >= NotificationManager.IMPORTANCE_DEFAULT }?.sound else soundUri()
                        if (sound != null && getSystemService(AudioManager::class.java)?.ringerMode == AudioManager.RINGER_MODE_NORMAL && manager?.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL)
                            RingtoneManager.getRingtone(this, sound)?.play()
                        result.success(null)
                        return@setMethodCallHandler
                    }
                }
                if (call.method != "unlock") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val manager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
                val prompt = manager.createConfirmDeviceCredentialIntent("BEYOND TRACK", null)
                if (prompt == null || pending != null) {
                    result.success(false)
                } else {
                    pending = result
                    startActivityForResult(prompt, 7511)
                }
            }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if(requestCode==7513){
            try {
                val uri=data?.data
                if(resultCode==RESULT_OK && uri!=null){
                    val stream=contentResolver.openOutputStream(uri) ?: throw java.io.IOException("Unavailable document")
                    stream.use { it.write(requireNotNull(saveBytes)) }
                }
                saveResult?.success(null)
            } catch(e:Exception){saveResult?.error("save",e.message,null)}
            finally {saveResult=null;saveBytes=null}
        }
        if (requestCode == 7512) {
            val files = mutableListOf<String>()
            if (resultCode == RESULT_OK) {
                captureUri?.let { files.add(it.toString()) }
                data?.data?.takeIf { it.scheme == "content" }?.let { files.add(it.toString()) }
                data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) {
                    clip.getItemAt(i).uri?.takeIf { it.scheme == "content" }?.let { files.add(it.toString()) }
                } }
            }
            fileSelection?.success(files.distinct())
            fileSelection = null
            captureUri = null
        }
        if (requestCode == 7511) {
            pending?.success(resultCode == RESULT_OK)
            pending = null
        }
    }
}
