package decima

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.http.scaladsl.Http
import akka.http.scaladsl.server._
import akka.http.scaladsl.model.{HttpEntity, ContentType, StatusCodes}
import akka.http.scaladsl.model.MediaTypes.`text/css`
import akka.http.scaladsl.model.HttpCharsets.`UTF-8`

import cats.implicits._

import com.typesafe.config.ConfigFactory

import io.circe.Json
import io.circe.syntax._
import io.circe.generic.auto._

import org.joda.time.{LocalDate, LocalDateTime}

import de.heikoseeberger.akkahttpcirce.FailFastCirceSupport

import scala.util.{Success, Failure}


object Main
  extends App
  with FailFastCirceSupport
  with Directives {

  implicit val system = ActorSystem()
  implicit val materializer = ActorMaterializer()

  val commonCss = Map("textcolor" -> "#f8f8f8")

  val workCss = Map(
    "maincolor" -> "rgba(110, 156, 185, 0.2)",
    "maincolorheader" -> "rgba(110, 156, 185, 0.9)",
  )

  val lifeCss = workCss

  new Decima("core/work.json", 1337, commonCss ++ workCss).start()
  new Decima("core/life.json", 8080, commonCss ++ lifeCss).start()
}


final class Decima
    (file: String, port: Int, cssVariables: Map[String, String])
    (implicit system: ActorSystem, materializer: ActorMaterializer)
  extends Directives {

  import system.dispatcher

  def start(): Unit = {
    val storage = new FileStorage(file)
    val youtube = new YouTube(ConfigFactory.load.getString("decima.youtube.key"))
    val journal = Journal(storage, youtube)
    val server = new Server(journal, cssVariables)

    implicit val exceptionHandler = ExceptionHandler {
      case reason: IllegalArgumentException =>
        complete(StatusCodes.BadRequest -> reason.getMessage)
    }

    Http()
      .bindAndHandle(server.route, interface = "0.0.0.0", port = port)
      .onComplete {
        case Success(binding) =>
          println(binding)
        case Failure(reason) =>
          println(Console.RED + "ERROR: " + reason.getMessage + Console.RESET)
          system.terminate()
          sys.exit(1)
      }
  }
}


final class Server(journal: Journal, cssVariables: Map[String, String])
  extends FailFastCirceSupport
  with Directives
  with MonixMarshalling {

  def badRequest(message: String): Nothing = {
    throw new IllegalArgumentException(message)
  }

  def serializeEvents(events: Seq[Event]): Seq[Json] = {
    val toggledTodos = journal.toggledTodos
    events.flatMap { event =>
      event.content match {
        case _: ToggleTodo =>
          None
        case _ if toggledTodos.contains(event.id getOrElse 0L) =>
          Some(event.asJson.mapObject(_.add("completed", true.asJson)))
        case _ =>
          Some(event.asJson)
      }
    }
  }

  private def textEntires: Seq[Text] = {
    extractEntries(journal.log)
  }

  private def extractEntries(log: Seq[Event]): Seq[Text] = {
    log
      .map( _.content )
      .collect { case text: Text => text }
  }

  private def allTags: Set[String] = {
    extractTags(textEntires)
  }

  private def extractTags(entries: Seq[Text]): Set[String] = {
    entries.flatMap( _.tags ).toSet
  }

  private def entriesByDate(): Seq[(LocalDate, Seq[Event])] = {
    groupByDate(journal.log)
  }

  private def groupByDate(log: Seq[Event]): Seq[(LocalDate, Seq[Event])] = {
    log
      .groupBy { event =>
        new LocalDateTime(event.creationTime).toLocalDate
      }
      .toSeq
      .sortBy( _._1.toString )
  }

  val route = {
    pathPrefix("api") {
      path("tags") {
        complete(allTags.toSeq)
      } ~
      path("stats") {
        complete {
          val log = journal.log
          val entries = extractEntries(log)

          Json.obj(
            "entries" -> Json.obj(
              "total" -> entries.size.asJson,
              "by-date" -> groupByDate(log)
                .map { case (k, v) => k.toString -> v.size }
                .asJson,
            ),
            "tags" -> Json.obj(
              "total" -> extractTags(entries).size.asJson,
              "by-name" -> entries
                .flatMap( _.tags )
                .groupBy(identity)
                .map { case (k, v) => k -> v.size }
                .asJson,
            )
          )
        }

      } ~
      path("log") {
        parameter('filter) { filter =>
          complete {
            serializeEvents {
              journal
                .log
                .filter { event =>
                  event.content match {
                    case text: Text => text.tags.contains(filter)
                    case _ => false
                  }
                }
                .sortBy( event => event.text.map(Journal.stripTags) )
            }
          }

        } ~
        complete {
          serializeEvents(journal.log)
        }

      } ~
      path("log-by-date") {
        complete {
          entriesByDate().toVector.foldMap { case (key, events) =>
            Vector(
              Json.obj(
                "date" -> key.toString.asJson,
                "events" -> serializeEvents(events).asJson,
              )
            )
          }
        }

      } ~
      path("save") {
        post {
          entity(as[String]) { content =>
            complete {
              journal.save(content)
            }
          }
        }

      } ~
      path("toggle-todo") {
        get {
          parameters(('id.as[Long], 'done.as[Boolean])) { (id, done) =>
            complete {
              journal.log.lift(id.toInt) match {
                case Some(event) =>
                  event.content match {
                    case text: Text if text.tags.contains("todo") =>
                      journal.save(ToggleTodo(id, done))
                    case _ =>
                      badRequest(f"Event `$event` is not a todo")
                  }

                case None =>
                  badRequest(f"No event with id: $id")
              }
            }
          }
        }
      }

    } ~
    pathSingleSlash { getFromFile("frontend/index.html") } ~
    path("variables.css") {
      val content = cssVariables
        .map { case (key, value) => f"--$key: $value;" }
        .mkString(":root {\n", "\n", "}")

      val contentType = ContentType.WithCharset(`text/css`, `UTF-8`)

      complete(HttpEntity(contentType, content))
    } ~
    getFromDirectory("frontend")
  }
}

