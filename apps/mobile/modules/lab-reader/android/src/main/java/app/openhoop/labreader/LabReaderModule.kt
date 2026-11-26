package app.openhoop.labreader

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlin.math.max
import kotlin.math.min

private const val RENDER_WIDTH = 2000
private const val MAX_RENDER_HEIGHT = 6000
private const val MAX_OCR_PAGES = 20
private const val MAX_TEXT_PAGES = 50
private const val MIN_TEXT_CHARS = 40
private const val MAX_TEXT_LINES = 20000

class UnreadableReportException(cause: Throwable? = null) :
  CodedException("ERR_LAB_UNREADABLE", "The report could not be read", cause)

class EncryptedReportException :
  CodedException("ERR_LAB_ENCRYPTED", "The PDF is protected with a password", null)

class LabReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("LabReader")

    AsyncFunction("recognizeImage") Coroutine { uri: String ->
      withContext(Dispatchers.IO) {
        guarded {
          withRecognizer { recognizer ->
            mapOf("source" to "ocr", "pages" to listOf(recognize(recognizer, InputImage.fromFilePath(context, parse(uri)))))
          }
        }
      }
    }

    AsyncFunction("readPdf") Coroutine { uri: String, maxOcrPages: Int, forceOcr: Boolean ->
      withContext(Dispatchers.IO) {
        guarded {
          val source = parse(uri)
          val lines = if (forceOcr) null else extractText(source)
          if (lines != null) {
            mapOf("source" to "text", "lines" to lines)
          } else {
            mapOf("source" to "ocr", "pages" to renderAndRecognize(source, maxOcrPages.coerceIn(1, MAX_OCR_PAGES)))
          }
        }
      }
    }

    AsyncFunction("prepareImage") Coroutine { uri: String, maxEdge: Int, quality: Int ->
      withContext(Dispatchers.IO) {
        guarded { prepareImage(parse(uri), maxEdge.coerceIn(256, 4096), quality.coerceIn(40, 95)) }
      }
    }
  }

  private inline fun <T> guarded(block: () -> T): T =
    try {
      block()
    } catch (error: CodedException) {
      throw error
    } catch (error: Exception) {
      throw UnreadableReportException(error)
    } catch (error: OutOfMemoryError) {
      throw UnreadableReportException(error)
    }

  private fun parse(uri: String): Uri {
    val parsed = Uri.parse(uri)
    if (parsed.scheme != ContentResolver.SCHEME_FILE && parsed.scheme != ContentResolver.SCHEME_CONTENT) {
      throw UnreadableReportException()
    }
    return parsed
  }

  private fun open(uri: Uri): InputStream =
    context.contentResolver.openInputStream(uri) ?: throw UnreadableReportException()

  private inline fun <T> withRecognizer(block: (TextRecognizer) -> T): T {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try {
      return block(recognizer)
    } finally {
      recognizer.close()
    }
  }

  private fun recognize(recognizer: TextRecognizer, image: InputImage): List<Map<String, Any>> {
    val text = Tasks.await(recognizer.process(image))
    val lines = mutableListOf<Map<String, Any>>()
    for (block in text.textBlocks) {
      for (line in block.lines) {
        val box = line.boundingBox ?: continue
        lines.add(
          mapOf(
            "text" to line.text,
            "left" to box.left,
            "top" to box.top,
            "right" to box.right,
            "bottom" to box.bottom,
          ),
        )
      }
    }
    return lines
  }

  private fun extractText(uri: Uri): List<String>? {
    PDFBoxResourceLoader.init(context.applicationContext)
    open(uri).use { input ->
      val document =
        try {
          PDDocument.load(input, MemoryUsageSetting.setupTempFileOnly())
        } catch (error: InvalidPasswordException) {
          throw EncryptedReportException()
        }
      document.use { doc ->
        val stripper = PDFTextStripper().apply {
          sortByPosition = true
          startPage = 1
          endPage = min(doc.numberOfPages, MAX_TEXT_PAGES)
        }
        val text = stripper.getText(doc)
        if (text.count { it.isLetterOrDigit() } < MIN_TEXT_CHARS) return null
        return text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.take(MAX_TEXT_LINES).toList()
      }
    }
  }

  private fun renderAndRecognize(uri: Uri, maxPages: Int): List<List<Map<String, Any>>> {
    val descriptor = context.contentResolver.openFileDescriptor(uri, "r") ?: throw UnreadableReportException()
    descriptor.use { fd ->
      val renderer =
        try {
          PdfRenderer(fd)
        } catch (error: SecurityException) {
          throw EncryptedReportException()
        }
      renderer.use { pdf ->
        return withRecognizer { recognizer ->
          (0 until min(pdf.pageCount, maxPages)).map { index ->
            pdf.openPage(index).use { page -> recognizePage(recognizer, page) }
          }
        }
      }
    }
  }

  private fun recognizePage(recognizer: TextRecognizer, page: PdfRenderer.Page): List<Map<String, Any>> {
    val scale = RENDER_WIDTH.toFloat() / max(page.width, 1)
    val height = (page.height * scale).toInt().coerceIn(1, MAX_RENDER_HEIGHT)
    val bitmap = Bitmap.createBitmap(RENDER_WIDTH, height, Bitmap.Config.ARGB_8888)
    try {
      bitmap.eraseColor(Color.WHITE)
      page.render(bitmap, null, Matrix().apply { setScale(scale, scale) }, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
      return recognize(recognizer, InputImage.fromBitmap(bitmap, 0))
    } finally {
      bitmap.recycle()
    }
  }

  private fun rotationOf(uri: Uri): Int =
    try {
      open(uri).use { ExifInterface(it).rotationDegrees }
    } catch (error: Exception) {
      0
    }

  private fun prepareImage(uri: Uri, maxEdge: Int, quality: Int): Map<String, Any> {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw UnreadableReportException()
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2
    val decoded = open(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
      ?: throw UnreadableReportException()
    val longest = max(decoded.width, decoded.height)
    val factor = if (longest > maxEdge) maxEdge.toFloat() / longest else 1f
    val matrix = Matrix().apply {
      postScale(factor, factor)
      postRotate(rotationOf(uri).toFloat())
    }
    val output = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    try {
      val stream = ByteArrayOutputStream()
      if (!output.compress(Bitmap.CompressFormat.JPEG, quality, stream)) throw UnreadableReportException()
      return mapOf(
        "base64" to Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP),
        "width" to output.width,
        "height" to output.height,
      )
    } finally {
      if (output !== decoded) output.recycle()
      decoded.recycle()
    }
  }
}
