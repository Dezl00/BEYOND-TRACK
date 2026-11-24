package online.beyondtrack.app

import android.content.Context
import android.graphics.Color
import android.graphics.pdf.PdfDocument
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.*
import android.text.*
import java.io.FileOutputStream

class TrackPrintAdapter(private val title: String, private val text: String, private val rtl: Boolean, private val finished: () -> Unit) : PrintDocumentAdapter() {
    private lateinit var layout: StaticLayout
    private var width = 595
    private var height = 842
    private var pages = listOf(0)
    override fun onLayout(old: PrintAttributes?, new: PrintAttributes, signal: CancellationSignal, callback: LayoutResultCallback, extras: Bundle?) {
        if (signal.isCanceled) { callback.onLayoutCancelled(); return }
        val size = new.mediaSize ?: PrintAttributes.MediaSize.ISO_A4
        width = size.widthMils * 72 / 1000
        height = size.heightMils * 72 / 1000
        val paint = TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 12f }
        layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, (width - 72).coerceAtLeast(1))
            .setTextDirection(if(rtl) TextDirectionHeuristics.FIRSTSTRONG_RTL else TextDirectionHeuristics.FIRSTSTRONG_LTR)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL).setLineSpacing(3f,1f).build()
        val starts = mutableListOf(0)
        for(i in 1 until layout.lineCount) {
            if(layout.getLineBottom(i) - starts.last() > height-72) starts.add(layout.getLineTop(i))
        }
        pages = starts
        callback.onLayoutFinished(PrintDocumentInfo.Builder(title).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(pages.size).build(), old != new)
    }
    override fun onWrite(ranges: Array<out PageRange>, destination: ParcelFileDescriptor, signal: CancellationSignal, callback: WriteResultCallback) {
        val pdf = PdfDocument()
        try {
            val written = mutableListOf<PageRange>()
            for(i in pages.indices) {
                if(signal.isCanceled) { callback.onWriteCancelled(); return }
                if(ranges.none { i in it.start..it.end }) continue
                val page=pdf.startPage(PdfDocument.PageInfo.Builder(width,height,i+1).create())
                val canvas=page.canvas
                canvas.translate(36f,36f)
                canvas.clipRect(0,0,width-72,(pages.getOrNull(i+1) ?: layout.height)-pages[i])
                canvas.translate(0f,-pages[i].toFloat())
                layout.draw(canvas)
                pdf.finishPage(page)
                written.add(PageRange(i,i))
            }
            FileOutputStream(destination.fileDescriptor).use { pdf.writeTo(it) }
            callback.onWriteFinished(written.toTypedArray())
        } catch(e:Exception) { callback.onWriteFailed(e.localizedMessage) } finally { pdf.close() }
    }
    override fun onFinish() { finished() }
}
