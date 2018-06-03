package decima

import monix.eval.Task
import monix.execution.Scheduler
import monix.execution.schedulers.CanBlock
import scala.concurrent.duration.Duration


trait MonixSpec {
  def runTask[T](task: Task[T]): T = {
    task.runSyncUnsafe(Duration.Inf)(Scheduler.global, CanBlock.permit)
  }

  implicit class MonixSpecOps[T](task: Task[T]) {
    def await: T = runTask(task)
  }
}

