package decima

import akka.http.scaladsl.marshalling.{Marshaller, ToEntityMarshaller}

import monix.eval.Task
import monix.execution.Scheduler


object MonixMarshalling extends MonixMarshalling

trait MonixMarshalling {
  implicit final def taskMarshaller[A](
    implicit
    scheduler: Scheduler,
    marshaller: ToEntityMarshaller[A],
  ): ToEntityMarshaller[Task[A]] = {
    Marshaller { _ => task =>
      task
        .flatMap(result => Task.deferFuture(marshaller(result)))
        .runAsync
    }
  }
}

