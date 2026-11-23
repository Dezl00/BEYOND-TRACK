package online.beyondtrack.app

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var pending: MethodChannel.Result? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        super.onCreate(savedInstanceState)
    }

    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger, "online.beyondtrack.app/device")
            .setMethodCallHandler { call, result ->
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
        if (requestCode == 7511) {
            pending?.success(resultCode == RESULT_OK)
            pending = null
        }
    }
}
