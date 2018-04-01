package decima


final case class Event(
  creationTime: Long,
  content: EventContent,
) {
  def text: Option[String] = content match {
    case text: Text => Some(text.content)
    case _ => None
  }
}


sealed trait EventContent
final case class Text(tags: Set[String], content: String) extends EventContent
final case class ToggleTodo(id: Long, done: Boolean) extends EventContent

