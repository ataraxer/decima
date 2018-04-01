package decima

import cats.{Applicative, FlatMap}
import cats.syntax.applicative._
import cats.syntax.flatMap._


object Journal {
  val TagRegex = """#[\w\d-_]+""".r
  val WrappedTagRegex = """`#[\w\d-_]+`""".r

  def extractTags(input: String): Set[String] = {
    TagRegex.findAllIn(input).map( _ stripPrefix "#" ).toSet
  }

  def stripTags(input: String): String = {
    WrappedTagRegex.replaceAllIn(input, "").trim
  }
}


final class Journal[F[_]: Applicative : FlatMap](storage: Storage[F]) {
  import Journal._

  private[this] var _log = Seq.empty[Event]

  storage.load().flatMap { result => (_log = result).pure[F] }

  def log: Seq[Event] = _log

  def save(content: String): F[Unit] = {
    save {
      Text(
        tags = extractTags(content),
        content = TagRegex.replaceAllIn(content.trim, m => f"`$m`")
      )
    }
  }

  def save(content: EventContent): F[Unit] = {
    val event = Event(
      creationTime = System.currentTimeMillis,
      content = content,
    )

    storage.save(event) >> (_log :+= event).pure[F]
  }
}

