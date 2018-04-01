package decima

import cats.{Applicative, FlatMap}
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
  private[this] var _toggledTodos = Set.empty[Long]

  private def toggleTodo(event: Event): Unit = {
    event.content match {
      case toggle: ToggleTodo =>
        if (toggle.done) _toggledTodos += toggle.id
        else _toggledTodos -= toggle.id
      case _ =>
    }
  }

  storage.load().flatMap { result =>
    result.foreach(toggleTodo)
    _log = result
    Applicative[F].pure(Unit)
  }

  def log: Seq[Event] = _log
  def toggledTodos: Set[Long] = _toggledTodos

  def save(content: String): F[Unit] = {
    save {
      Text(
        tags = extractTags(content),
        content = TagRegex.replaceAllIn(content.trim, m => f"`$m`"),
      )
    }
  }

  def save(content: EventContent): F[Unit] = {
    val event = Event(
      id = Some(_log.lastOption.flatMap( _.id ).fold(0L)( _ + 1 )),
      creationTime = System.currentTimeMillis,
      content = content,
    )

    storage.save(event) >> {
      toggleTodo(event)
      _log :+= event
      Applicative[F].pure({})
    }
  }
}

