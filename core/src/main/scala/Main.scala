package decima

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.http.scaladsl.Http
import akka.http.scaladsl.server._
import akka.http.scaladsl.model.StatusCodes

import cats.implicits._

import com.typesafe.config.ConfigFactory

import monix.eval.Task
import monix.execution.Scheduler.Implicits.global

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

  val storage = new FileStorage[Task]("second.json")
  val youtube = new YouTube(ConfigFactory.load.getString("decima.youtube.key"))

  Journal(storage, youtube)
    .map { journal =>
      val server = new Server(journal)

      implicit val exceptionHandler = ExceptionHandler {
        case reason: IllegalArgumentException =>
          complete(StatusCodes.BadRequest -> reason.getMessage)
      }

      Http()
        .bindAndHandle(server.route, interface = "0.0.0.0", port = 8080)
        .onComplete {
          case Success(binding) =>
            println(binding)
          case Failure(reason) =>
            println(Console.RED + "ERROR: " + reason.getMessage + Console.RESET)
            system.terminate()
            sys.exit(1)
        }
    }
    .runAsync
}



final class Server(journal: Journal[Task])
  extends FailFastCirceSupport
  with Directives
  with MonixMarshalling {

  def badRequest(message: String): Nothing = {
    throw new IllegalArgumentException(message)
  }

  def serializeEvents(events: Seq[Event]): Task[Seq[Json]] = {
    journal.toggledTodos.map { toggledTodos =>
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
  }

  private def textEntires: Task[Seq[Text]] = {
    journal.log.map(extractEntries)
  }

  private def extractEntries(log: Seq[Event]): Seq[Text] = {
    log
      .map( _.content )
      .collect { case text: Text => text }
  }

  private def allTags: Task[Set[String]] = {
    textEntires.map(extractTags)
  }

  private def extractTags(entries: Seq[Text]): Set[String] = {
    entries.flatMap( _.tags ).toSet
  }

  private def entriesByDate: Task[Seq[(LocalDate, Seq[Event])]] = {
    journal.log.map(groupByDate)
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
        complete(allTags.map( _.toSeq.sorted ))

      } ~
      path("stats") {
        complete {
          journal.log map { log =>
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
        }

      } ~
      path("log") {
        parameter('filter) { filter =>
          complete {
            journal.log
              .map { log =>
                log
                  .filter { event =>
                    event.content match {
                      case text: Text => text.tags.contains(filter)
                      case _ => false
                    }
                  }
                  .sortBy( event => event.text.map(Journal.stripTags) )
              }
              .flatMap(serializeEvents)
          }

        } ~
        complete {
          journal.log.flatMap(serializeEvents)
        }

      } ~
      path("log-by-date") {
        complete {
          entriesByDate map { entries =>
            entries
              .toVector
              .foldMap { case (key, events) =>
                serializeEvents(events) map { events =>
                  Vector(
                    Json.obj(
                      "date" -> key.toString.asJson,
                      "events" -> events.asJson,
                    )
                  )
                }
              }
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
              journal.log.flatMap { log =>
                log.lift(id.toInt) match {
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
      }

    } ~
    pathSingleSlash { getFromFile("../frontend/index.html") } ~
    getFromDirectory("../frontend")
  }
}

