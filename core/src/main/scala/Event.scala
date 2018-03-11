package decima


final case class Event(
  creationTime: Long,
  tags: Set[String],
  content: EventContent,
)


sealed trait EventContent
final case class Text(content: String) extends EventContent

