val commonSettings = Seq(
  organization := "com.ataraxer",
  version := "1.0.0",

  scalaVersion := "2.12.4",

  scalacOptions ++= Seq(
    "-encoding", "utf-8",
    "-deprecation",
    "-feature",
    "-explaintypes",
    "-language:existentials",
    "-language:experimental.macros",
    "-language:higherKinds",
    "-unchecked",
    "-Xcheckinit",
    "-Xfatal-warnings",
    "-Xfuture",
    "-Xlint",
    "-Yno-adapted-args",
    "-Ypartial-unification",
    "-Ywarn-dead-code",
    "-Ywarn-extra-implicit",
    "-Ywarn-inaccessible",
    "-Ywarn-infer-any",
    "-Ywarn-nullary-override",
    "-Ywarn-nullary-unit",
    "-Ywarn-numeric-widen",
    "-Ywarn-unused",
    "-Ywarn-value-discard"
  ),

  scalacOptions in (Compile, console) -= "-Xfatal-warnings",
)

val circeVersion = "0.9.1"
val akkaVersion = "2.5.9"
val akkaHttpVersion = "10.0.11"

val akka = Seq(
  "com.typesafe.akka" %% "akka-actor",
  "com.typesafe.akka" %% "akka-stream",
).map( _ % akkaVersion )

val akkaTest = Seq(
  "com.typesafe.akka" %% "akka-testkit",
  "com.typesafe.akka" %% "akka-stream-testkit",
).map( _ % akkaVersion % Test )

val akkaHttp = Seq(
  "com.typesafe.akka" %% "akka-http" % akkaHttpVersion,
  "com.typesafe.akka" %% "akka-http-testkit" % akkaHttpVersion % Test,
)

val circe = Seq(
  "io.circe" %% "circe-core",
  "io.circe" %% "circe-generic",
  "io.circe" %% "circe-parser",
  "io.circe" %% "circe-optics",
).map( _ % circeVersion )

val other = Seq(
  "com.vladsch.flexmark" % "flexmark-all" % "0.32.24",
  "org.typelevel" %% "cats-effect" % "1.0.0-RC2",
  "io.monix" %% "monix" % "3.0.0-RC1",
  "joda-time" % "joda-time" % "2.9.9",
  "org.scalatest" %% "scalatest" % "3.0.4" % Test,
)

val dependencies = {
  libraryDependencies ++= Seq(
    circe,
    other,
  ).flatten
}

lazy val all = (project in file("."))
  .disablePlugins(RevolverPlugin)
  .aggregate(core)

lazy val core = (project in file("core"))
  .settings(name := "core")
  .settings(commonSettings: _*)
  .settings(dependencies)
  .settings(
    resolvers += Resolver.bintrayRepo("hseeberger", "maven"),
    libraryDependencies ++= Seq(akka, akkaTest, akkaHttp).flatten,
    libraryDependencies += "de.heikoseeberger" %% "akka-http-circe" % "1.19.0",
  )

