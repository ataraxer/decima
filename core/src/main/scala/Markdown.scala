package decima

import com.vladsch.flexmark.ast
import com.vladsch.flexmark.ast._
import com.vladsch.flexmark.ast.util._
import com.vladsch.flexmark.parser.Parser

import cats.implicits._

import akka.http.scaladsl.model.Uri

import scala.collection.mutable


sealed abstract class Markdown extends Product with Serializable


object Markdown {
  val parser = Parser.builder.build

  def parse(text: String): Seq[Markdown] = {
    val visitor = new AstMarkdownVisitor
    visitor.visit(parser.parse(text))
    visitor.output
  }

  def debug(text: String): Unit = {
    val visitor = new DebugMarkdownVisitor
    visitor.visit(parser.parse(text))
  }

  def render(nodes: Seq[Markdown]): String = {
    nodes.toVector.foldMap {
      case Text(content) => content
      case Link(text, url) => f"[$text]($url)"
      case LinkRef(url) => f"[$url]"
      case Italic(content) => f"*$content*"
      case Strong(content) => f"**$content**"
      case Code(content) => f"`$content`"
    }
  }

  final case class Text(content: String) extends Markdown
  final case class Link(text: String, url: Uri) extends Markdown
  final case class LinkRef(url: Uri) extends Markdown
  final case class Italic(content: String) extends Markdown
  final case class Strong(content: String) extends Markdown
  final case class Code(content: String) extends Markdown
}


class AstMarkdownVisitor
  extends BlockVisitor
  with InlineVisitor
{ outer =>
  val visitor: NodeVisitor = new NodeVisitor(
    BlockVisitorExt.VISIT_HANDLERS(this),
    InlineVisitorExt.VISIT_HANDLERS(this),
    Array[VisitHandler[_]](
      new VisitHandler[Node](classOf[Node], new Visitor [Node] {
        def visit(node: Node) = println(f"UNPROCESSED: $node")
      })
    )
  )

  private val nodes = mutable.ArrayBuffer.empty[Markdown]
  private def add(node: Markdown): Unit = nodes += node

  def output: Seq[Markdown] = nodes.toVector

  private def descend(node: Node): Unit = {
    visitor.visitChildren(node)
  }

  def visit(node: Node) = descend(node)
  def visit(node: Document) = descend(node)
  def visit(node: Paragraph) = descend(node)

  def visit(node: ThematicBreak) = {}
  def visit(node: Reference) = {}
  def visit(node: OrderedList) = {}
  def visit(node: OrderedListItem) = {}
  def visit(node: BulletListItem) = {}
  def visit(node: IndentedCodeBlock) = {}
  def visit(node: HtmlCommentBlock) = {}
  def visit(node: HtmlBlock) = {}
  def visit(node: Heading) = {}
  def visit(node: FencedCodeBlock) = {}
  def visit(node: BulletList) = {}
  def visit(node: BlockQuote) = {}

  def visit(node: ast.Text) = add(Markdown.Text(node.getChars.toString))
  def visit(node: Code) = add(Markdown.Code(node.getText.toString))
  def visit(node: StrongEmphasis) = add(Markdown.Strong(node.getText.toString))
  def visit(node: Emphasis) = add(Markdown.Italic(node.getText.toString))

  def visit(node: Link) = {
    add(Markdown.Link(
      text = node.getText.toString,
      url = Uri(node.getUrl.toString),
    ))
  }

  def visit(node: LinkRef) = {
    add(Markdown.LinkRef(url = Uri(node.getReference.toString)))
  }

  def visit(node: SoftLineBreak) = {}
  def visit(node: MailLink) = {}
  def visit(node: ImageRef) = {}
  def visit(node: Image) = {}
  def visit(node: HtmlInlineComment) = {}
  def visit(node: HtmlInline) = {}
  def visit(node: HtmlEntity) = {}
  def visit(node: HardLineBreak) = {}
  def visit(node: AutoLink) = {}
}


class DebugMarkdownVisitor
  extends BlockVisitor
  with InlineVisitor
{ outer =>
  val visitor: NodeVisitor = new NodeVisitor(
    BlockVisitorExt.VISIT_HANDLERS(this),
    InlineVisitorExt.VISIT_HANDLERS(this),
    Array[VisitHandler[_]](
      new VisitHandler[Node](classOf[Node], new Visitor [Node] {
        def visit(node: Node) = println(f"UNPROCESSED: $node")
      })
    )
  )

  private var level = 0

  def render(node: Node) = {
    println(("  " * level) + node)
  }

  def renderDelimited(node: DelimitedNode) = {
    println(("  " * level) + f"$node: ${node.getText.toString}")
  }

  def descend(node: Node): Unit = {
    render(node)
    level += 1
    visitor.visitChildren(node)
    level -= 1
  }

  def visit(node: Node) = descend(node)
  def visit(node: Document) = descend(node)
  def visit(node: Paragraph) = descend(node)

  def visit(node: ThematicBreak) = render(node)
  def visit(node: Reference) = render(node)
  def visit(node: OrderedList) = render(node)
  def visit(node: OrderedListItem) = render(node)
  def visit(node: BulletListItem) = render(node)
  def visit(node: IndentedCodeBlock) = render(node)
  def visit(node: HtmlCommentBlock) = render(node)
  def visit(node: HtmlBlock) = render(node)
  def visit(node: Heading) = render(node)
  def visit(node: FencedCodeBlock) = render(node)
  def visit(node: BulletList) = render(node)
  def visit(node: BlockQuote) = render(node)

  def visit(node: Code) = renderDelimited(node)
  def visit(node: StrongEmphasis) = renderDelimited(node)
  def visit(node: Emphasis) = renderDelimited(node)

  def visit(node: ast.Text) = render(node)
  def visit(node: SoftLineBreak) = render(node)
  def visit(node: MailLink) = render(node)
  def visit(node: LinkRef) = render(node)
  def visit(node: Link) = render(node)
  def visit(node: ImageRef) = render(node)
  def visit(node: Image) = render(node)
  def visit(node: HtmlInlineComment) = render(node)
  def visit(node: HtmlInline) = render(node)
  def visit(node: HtmlEntity) = render(node)
  def visit(node: HardLineBreak) = render(node)
  def visit(node: AutoLink) = render(node)
}

