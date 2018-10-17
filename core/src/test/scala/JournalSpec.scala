package decima

import akka.actor.ActorSystem

import com.typesafe.config.ConfigFactory


class JournalSpec extends UnitSpec with MonixSpec {
  def swallow[T](code: => T): Unit = { code; {} }

  val config = ConfigFactory.load("tests").getConfig("decima.tests")

  def withYoutube[T](test: YouTube => T): Unit = {
    if (config hasPath "youtube.key") {
      implicit val system = ActorSystem()
      try swallow(test(new YouTube(config.getString("youtube.key"))))
      finally swallow(system.terminate())
    }
  }

  "Journal" should "detect and expand YouTube links" in withYoutube { youtube =>
    val videoId = "jNQXAC9IVRw"
    val uri = f"https://youtu.be/$videoId"
    val input = Markdown.parse(f"foo [$uri] bar")
    val output = Markdown.render(Journal.processContent(youtube, input))

    output should be (f"foo [Me at the zoo]($uri) bar")
  }

  it should "detect tags in text" in withYoutube { youtube =>
    val input = Markdown.parse(f"#foo test #bar")
    val output = Markdown.render(Journal.processContent(youtube, input))

    output should be (f"`#foo` test `#bar`")
  }

  it should "ignore tags in other elements" in withYoutube { youtube =>
    val input = Markdown.parse(f"#foo [#test](#link) #bar")
    val output = Markdown.render(Journal.processContent(youtube, input))

    output should be (f"`#foo` [#test](#link) `#bar`")
  }
}

