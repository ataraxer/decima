package decima

import akka.actor.ActorSystem
import akka.http.scaladsl.model.Uri
import com.typesafe.config.ConfigFactory
import scala.concurrent.duration._


class YouTubeSpec extends UnitSpec with MonixSpec {
  val config = ConfigFactory.load("tests").getConfig("decima.tests")

  def withSystem[T](code: ActorSystem => T): T = {
    val system = ActorSystem()
    try code(system)
    finally { system.terminate(); () }
  }

  "YouTube" should "extract video id from URI" in {
    val videoId = "jNQXAC9IVRw"

    val uris = Seq(
      Uri(f"https://www.youtube.com/watch?v=$videoId"),
      Uri(f"https://youtube.com/watch?v=$videoId"),
      Uri(f"https://youtu.be/$videoId"),
      Uri(f"https://youtu.be/$videoId?and-some-params=foo"),
    )

    forAll(uris) { uri => YouTube.extractVideoId(uri) should be (Some(videoId)) }
  }

  it should "fetch video's meta" in withSystem { implicit system =>
    if (config hasPath "youtube.key") {
      val key = config.getString("youtube.key")
      val videoId = "jNQXAC9IVRw"
      val uri = Uri(f"https://youtu.be/$videoId")
      val result = new YouTube(key).fetchMeta(uri)

      result should be (Some(YouTubeMeta("Me at the zoo", "jawed", 19.seconds)))
    }
  }
}

