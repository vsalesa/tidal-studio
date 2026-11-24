#!/usr/bin/env bash
# Renders every .puml in this folder to SVG and PNG.
# Needs Java, Graphviz (dot) and plantuml.jar (https://plantuml.com/download):
#   PLANTUML_JAR=/path/to/plantuml.jar ./render.sh
set -euo pipefail
cd "$(dirname "$0")"
JAR="${PLANTUML_JAR:-plantuml.jar}"
java -jar "$JAR" -charset UTF-8 -tsvg ./*.puml
java -jar "$JAR" -charset UTF-8 -tpng -Sdpi=144 ./*.puml
