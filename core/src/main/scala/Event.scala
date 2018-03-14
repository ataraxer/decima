package decima


final case class Event(
  creationTime: Long,
  tags: Set[String],
  content: EventContent,
) {
  def text = content match {
    case Text(value) => value
  }
}


sealed trait EventContent
final case class Text(content: String) extends EventContent

