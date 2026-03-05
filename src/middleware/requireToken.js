export function createRequireToken(pdfServiceTokens) {
  return function requireToken(req, res, next) {
    if (!pdfServiceTokens.length) {
      res.status(503).json({
        message: "PDF_SERVICE_TOKEN nao configurado.",
      });
      return;
    }

    const headerToken = req.header("x-pdf-token")?.trim();
    const authHeader = req.header("authorization")?.trim() || "";
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const providedToken = (headerToken || bearerToken || "").trim();

    if (!providedToken || !pdfServiceTokens.includes(providedToken)) {
      res.status(401).json({ message: "Token invalido." });
      return;
    }

    next();
  };
}

