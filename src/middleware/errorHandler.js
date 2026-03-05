export function errorHandler(error, _req, res, _next) {
  if (error?.message === "Origem nao permitida pelo PDF service") {
    res.status(403).json({ message: "Origem nao permitida pelo PDF service." });
    return;
  }

  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ message: "JSON invalido no body." });
    return;
  }

  console.error("Erro interno no PDF service:", error);
  res.status(500).json({ message: "Erro interno no PDF service." });
}
