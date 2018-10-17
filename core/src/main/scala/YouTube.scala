package decima

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.{HttpRequest, Uri}
import akka.http.scaladsl.model.HttpMethods.GET

import org.joda.time.Period

import io.circe.{DecodingFailure, Json}
import io.circe.parser.parse

import scala.concurrent.Await
import scala.concurrent.duration._


object YouTube {
  val UriRegex = """(https?://)?(www.)?(youtube.com|youtu.be)[^\s]*""".r

  val ApiUri = Uri("https://www.googleapis.com/youtube/v3/videos")

  def extractVideoId(uri: Uri): Option[String] = {
    uri.authority.host.toString.stripPrefix("www.") match {
      case "youtube.com" if uri.path.toString == "/watch" => uri.query().get("v")
      case "youtu.be" => Option(uri.path.toString.stripPrefix("/"))
      case _ => None
    }
  }

  def unapply(uri: Uri): Option[String] = extractVideoId(uri)

  def parseMeta(json: Json): Either[DecodingFailure, YouTubeMeta] = {
    val items = json.hcursor.downField("items").downArray
    val snippet = items.downField("snippet")
    val details = items.downField("contentDetails")

    for {
      title <- snippet.get[String]("title")
      channel <- snippet.get[String]("channelTitle")
      durationString <- details.get[String]("duration")
    } yield {
      YouTubeMeta(
        title = title,
        channel = channel,
        duration = Period.parse(durationString).toStandardDuration.getMillis.millis,
      )
    }
  }
}


final case class YouTubeMeta(
  title: String,
  channel: String,
  duration: FiniteDuration,
)


final class YouTube(apiKey: String)(implicit system: ActorSystem) {
  import YouTube._

  private implicit val materializer = ActorMaterializer()

  def unapply(uri: Uri): Option[Option[YouTubeMeta]] = {
    uri match {
      case YouTube(videoId) => Some(fetchMeta(videoId))
      case _ => None
    }
  }

  def fetchMeta(uri: Uri): Option[YouTubeMeta] = {
    uri match {
      case YouTube(videoId) => fetchMeta(videoId)
      case _ => None
    }
  }

  def fetchMeta(videoId: String): Option[YouTubeMeta] = {
    val uri = ApiUri.withQuery(Uri.Query(
      "key" -> apiKey,
      "id" -> videoId,
      "part" -> "snippet,contentDetails"
    ))

    val response = Await.result(Http().singleRequest(HttpRequest(GET, uri)), 5.seconds)
    val entity = Await.result(response.entity.toStrict(30.seconds), 5.seconds)

    parse(entity.data.utf8String)
      .flatMap(parseMeta)
      .fold(throw _, Option(_))
  }
}

