package decima

import akka.http.scaladsl.model.Uri


final case class LinkRewriteRule(extract: Uri => Option[String]) {
  def unapply(url: Uri): Option[Markdown] = {
    extract(url).map(Markdown.Link(_, url))
  }
}


object Journal {
  val TagRegex = """#[\w\d-_]+""".r
  val WrappedTagRegex = """`#[\w\d-_]+`""".r

  object rewrites {
    val JiraRegex = """[^.]+\.atlassian.net/browse/([^/]+)""".r

    val jira = LinkRewriteRule { url =>
      url.toString match {
        case JiraRegex(ticket) => Some(ticket)
        case _ => None
      }
    }

    val GitHubRegex = """(https://)?github.com/([^/]+)/([^/]+)""".r

    val github = LinkRewriteRule { url =>
      url.toString match {
        case GitHubRegex(_, owner, name) => Some(f"$owner/$name")
        case _ => None
      }
    }
  }

  def extractTags(input: String): Set[String] = {
    TagRegex.findAllIn(input).map( _ stripPrefix "#" ).toSet
  }

  def stripTags(input: String): String = {
    WrappedTagRegex.replaceAllIn(input, "").trim
  }

  def apply(
    storage: Storage,
    youtube: YouTube,
  ): Journal = {
    val log = storage.load()

    val toggleTodos = {
      log.iterator
        .map( _.content )
        .collect { case toggle: ToggleTodo if toggle.done => toggle.id }
        .toSet
    }

    new Journal(storage, youtube, log, toggleTodos)
  }

  def wrapTags(content: String): String = {
    TagRegex.replaceAllIn(content, m => f"`$m`")
  }

  def processContent(
    youtube: YouTube,
    markdown: Seq[Markdown],
  ): Seq[Markdown] = {
    markdown.map {
      case Markdown.Text(content) =>
        Markdown.Text(wrapTags(content))

      case ref @ Markdown.LinkRef(url @ youtube(futureVideoMeta)) =>
        futureVideoMeta match {
          case None => ref
          case Some(info) => Markdown.Link(text = info.title, url = url)
        }

      case Markdown.LinkRef(rewrites.jira(output)) => output
      case Markdown.LinkRef(rewrites.github(output)) => output

      case other =>
        other
    }
  }
}


final class Journal(
  storage: Storage,
  youtube: YouTube,
  var _log: Seq[Event],
  var _toggledTodos: Set[Long],
) {
  import Journal._

  private def toggleTodo(event: Event): Unit = {
    event.content match {
      case toggle: ToggleTodo =>
        _toggledTodos = {
          if (toggle.done) _toggledTodos + toggle.id
          else _toggledTodos - toggle.id
        }

      case _ =>
    }
  }

  def log: Seq[Event] = _log
  def toggledTodos: Set[Long] = _toggledTodos

  def save(content: String): Unit = {
    val markdown = Markdown.parse(content.trim)
    val processed = processContent(youtube, markdown)
    save(Text(extractTags(content), Markdown.render(processed)))
  }

  def save(content: EventContent): Unit = {
    val event = Event(
      id = Some(log.lastOption.flatMap( _.id ).fold(0L)( _ + 1 )),
      creationTime = System.currentTimeMillis,
      content = content,
    )

    storage.save(event)
    toggleTodo(event)
    _log :+= event
  }
}

