package decima

import cats.Id

import io.circe.parser.parse
import io.circe.generic.auto._
import io.circe.syntax._

import scala.collection.JavaConverters._

import java.io._
import java.nio.charset.StandardCharsets
import java.nio.channels._
import java.nio.file._


trait Storage[F[_]] {
  def load(): F[Seq[Event]]
  def save(event: Event): F[Unit]
}


final class FileStorage(path: String) extends Storage[Id] {
  import StandardOpenOption._
  private val charset = StandardCharsets.UTF_8.toString
  private val channel = FileChannel.open(Paths.get(path), CREATE, WRITE, READ)

  private val reader = {
    new BufferedReader(Channels.newReader(channel, charset))
  }

  private val writer = {
    new PrintWriter(new BufferedWriter(Channels.newWriter(channel, charset)))
  }

  def load(): Seq[Event] = {
    reader.lines().iterator.asScala.toSeq.map { line =>
      parse(line).flatMap( _.as[Event] ).fold(throw _, identity)
    }
  }

  def save(event: Event): Unit = {
    writer.println(event.asJson.noSpaces)
    writer.flush()
  }
}

