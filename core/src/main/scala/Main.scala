package decima

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.http.scaladsl.Http
import akka.http.scaladsl.server._
import akka.http.scaladsl.model.StatusCodes

import io.circe.generic.auto._

import de.heikoseeberger.akkahttpcirce.FailFastCirceSupport

import scala.util.{Success, Failure}


object Main extends App with FailFastCirceSupport with Directives {
  implicit val system = ActorSystem()
  implicit val materializer = ActorMaterializer()
  import system.dispatcher

  val storage = new FileStorage("test.json")
  val journal = new Journal(storage)

  val route = {
    pathPrefix("api") {
      path("log") {
        parameter('filter) { filter =>
          complete(journal.log.filter( _.tags.contains(filter) ))
        } ~
        complete(journal.log)
      } ~
      path("save") {
        post {
          entity(as[String]) { content =>
            complete {
              journal.save(content)
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

