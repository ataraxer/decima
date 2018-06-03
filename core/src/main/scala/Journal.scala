package decima

import cats.{Applicative, FlatMap, Functor}
import cats.implicits._
import cats.effect.Concurrent
import cats.effect.concurrent.Ref

import monix.eval.Task
import monix.execution.Scheduler.Implicits.global


object Journal {
  val TagRegex = """#[\w\d-_]+""".r
  val WrappedTagRegex = """`#[\w\d-_]+`""".r

  def extractTags(input: String): Set[String] = {
    TagRegex.findAllIn(input).map( _ stripPrefix "#" ).toSet
  }

  def stripTags(input: String): String = {
    WrappedTagRegex.replaceAllIn(input, "").trim
  }

  def apply[F[_]: Concurrent : Applicative : Functor : FlatMap](
    storage: Storage[F],
    youtube: YouTube,
  ): F[Journal[F]] = {
    for {
      log <- storage.load()
      _log <- Ref.of(log)
      _toggleTodos <- Ref.of {
        log.iterator
          .map( _.content )
          .collect { case toggle: ToggleTodo if toggle.done => toggle.id }
          .toSet
      }
    } yield {
      new Journal(storage, youtube, _log, _toggleTodos)
    }
  }

  def wrapTags(content: String): String = {
    TagRegex.replaceAllIn(content, m => f"`$m`")
  }

  def processContent(
    youtube: YouTube,
    markdown: Seq[Markdown],
  ): Task[Seq[Markdown]] = {
    markdown.toVector.traverse {
      case Markdown.Text(content) =>
        Task.now(Markdown.Text(wrapTags(content)))

      case ref @ Markdown.LinkRef(url @ youtube(futureVideoMeta)) =>
        futureVideoMeta map {
          case None => ref
          case Some(info) => Markdown.Link(text = info.title, url = url)
        }

      case other =>
        Task.now(other)
    }
  }
}


final class Journal[F[_]: Concurrent : Applicative : FlatMap](
  storage: Storage[F],
  youtube: YouTube,
  _log: Ref[F, Seq[Event]],
  _toggledTodos: Ref[F, Set[Long]],
) {

  import Journal._

  private def toggleTodo(event: Event): F[Unit] = {
    event.content match {
      case toggle: ToggleTodo =>
        _toggledTodos.update { toggled =>
          if (toggle.done) toggled + toggle.id
          else toggled - toggle.id
        }

      case _ =>
        Applicative[F].unit
    }
  }

  def log: F[Seq[Event]] = _log.get
  def toggledTodos: F[Set[Long]] = _toggledTodos.get

  def save(content: String): F[Unit] = {
    for {
      markdown <- Concurrent[F].unit.map( _ => Markdown.parse(content.trim) )
      processed <- processContent(youtube, markdown).to[F]
      _ <- save(Text(extractTags(content), Markdown.render(processed)))
    } yield {}
  }

  def save(content: EventContent): F[Unit] = {
    for {
      log <- _log.get

      event = Event(
        id = Some(log.lastOption.flatMap( _.id ).fold(0L)( _ + 1 )),
        creationTime = System.currentTimeMillis,
        content = content,
      )

      _ <- storage.save(event)
      _ <- toggleTodo(event)
      // FIXME: race
      _ <- _log.update( _ :+ event )
    } yield {}
  }
}

