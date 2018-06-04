package decima


class MarkdownSpec extends UnitSpec {
  import Markdown._

  val text = "#test `code` [hello](world) *italic* --strike-- **strong**"

  "Markdown" should "parse text to markdown AST" in {
    Markdown.parse(text) should be (Vector(
      Text("#test "),
      Code("code"),
      Text(" "),
      Link("hello", "world", ""),
      Text(" "),
      Italic("italic"),
      Text(" --strike-- "),
      Strong("strong"),
    ))
  }

  it should "render AST to text" in {
    Markdown.render(Markdown.parse(text)) should be (text)
  }
}
