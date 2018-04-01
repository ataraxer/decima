package decima

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.http.scaladsl.Http
import akka.http.scaladsl.server._
import akka.http.scaladsl.model.StatusCodes

import io.circe.Json
import io.circe.syntax._
import io.circe.generic.auto._

import org.joda.time.LocalDateTime

import de.heikoseeberger.akkahttpcirce.FailFastCirceSupport

import scala.util.{Success, Failure}


object Main extends App with FailFastCirceSupport with Directives {
  implicit val system = ActorSystem()
  implicit val materializer = ActorMaterializer()
  import system.dispatcher

  val storage = new FileStorage("second.json")
  val journal = new Journal(storage)

  def badRequest(message: String): Nothing = {
    throw new IllegalArgumentException(message)
  }

  def serializeEvents(events: Seq[Event]): Seq[Json] = {
    events.flatMap { event =>
      event.content match {
        case _: ToggleTodo =>
          None
        case _ if journal.toggledTodos.contains(event.id getOrElse 0L) =>
          Some(event.asJson.mapObject(_.add("completed", true.asJson)))
        case _ =>
          Some(event.asJson)
      }
    }
  }

  val route = {
    pathPrefix("api") {
      path("tags") {
        complete {
          journal.log
            .view
            .map( _.content )
            .collect { case text: Text => text.tags }
            .flatten
            .toSeq
            .distinct
            .sorted
        }

      } ~
      path("log") {
        parameter('filter) { filter =>
          complete {
            serializeEvents {
              journal.log
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
          journal.log
            .groupBy { event =>
              new LocalDateTime(event.creationTime).toLocalDate
            }
            .toSeq
            .sortBy( _._1.toString )
            .map { case (key, events) =>
              Json.obj(
                "date" -> key.toString.asJson,
                "events" -> serializeEvents(events).asJson
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
    pathSingleSlash { getFromFile("../frontend/index.html") } ~
    getFromDirectory("../frontend")
  }

  implicit val exceptionHandler = ExceptionHandler {
    case reason: IllegalArgumentException =>
      complete(StatusCodes.BadRequest -> reason.getMessage)
  }

  Http()
    .bindAndHandle(route, interface = "0.0.0.0", port = 8080)
    .onComplete {
      case Success(binding) =>
        println(binding)
      case Failure(reason) =>
        println(Console.RED + "ERROR: " + reason.getMessage + Console.RESET)
        system.terminate()
        sys.exit(1)
    }
}

