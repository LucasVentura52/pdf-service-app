import { chromium } from "playwright";
import {
  isRequestUrlAllowed,
  mergeAllowedAssetOrigins,
  recordAssetRequest,
  summarizeAssetRequests,
} from "./browserNetworkPolicy.js";
import {
  canUseDefaultSessionPool,
  resolveReusableSessionTarget,
} from "./browserSessionPool.js";
import { createPageRenderLifecycle } from "./pageRenderLifecycle.js";
import { normalizeBrowserError } from "./pdfServiceErrors.js";

export function buildChromiumLaunchOptions(config) {
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    // The API does not expose tagged PDFs, and this default Chromium arg adds measurable
    // overhead to page.pdf() for large documents.
    ignoreDefaultArgs: ["--export-tagged-pdf"],
  };

  if (config.pdfChromiumExecutablePath) {
    launchOptions.executablePath = config.pdfChromiumExecutablePath;
  }

  if (config.pdfChromiumChannel) {
    launchOptions.channel = config.pdfChromiumChannel;
  }

  return launchOptions;
}

export function createBrowserService(config) {
  let browserPromise = null;
  let isClosing = false;
  const bufferedSessions = [];
  const pendingBufferedSessionWarmups = new Set();
  const pageRenderLifecycle = createPageRenderLifecycle(config);

  async function getBrowser() {
    if (!browserPromise) {
      browserPromise = launchBrowser();
    }
    return browserPromise;
  }

  async function createContextWithNetworkGuard(extraAllowedAssetOrigins) {
    const browser = await getBrowser();
    const context = await browser.newContext({
      serviceWorkers: "block",
    });
    const assetRequests = new Map();
    const resolvedAllowedAssetOrigins = mergeAllowedAssetOrigins(
      config.normalizedAllowedAssetOrigins,
      extraAllowedAssetOrigins
    );
    await context.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      const allowed = isRequestUrlAllowed(
        requestUrl,
        resolvedAllowedAssetOrigins,
        config.pdfBlockPrivateNetwork
      );

      recordAssetRequest(assetRequests, requestUrl, request.resourceType(), !allowed);

      if (allowed) {
        await route.continue();
        return;
      }
      console.warn(
        `[pdf-service] Asset bloqueado durante renderizacao: ${requestUrl} | allowlist=${
          resolvedAllowedAssetOrigins.size
            ? Array.from(resolvedAllowedAssetOrigins).join(",")
            : "<public-assets-enabled>"
        }`
      );
      await route.abort("blockedbyclient");
    });
    return {
      context,
      assetRequests,
    };
  }

  async function launchBrowser() {
    const launchOptions = buildChromiumLaunchOptions(config);

    try {
      return await chromium.launch(launchOptions);
    } catch (error) {
      if (launchOptions.channel) {
        console.warn(
          `[pdf-service] Falha ao iniciar chromium com channel="${launchOptions.channel}". Tentando fallback sem channel.`
        );
        const { channel, ...fallbackOptions } = launchOptions;
        try {
          return await chromium.launch(fallbackOptions);
        } catch (fallbackError) {
          throw normalizeBrowserError(fallbackError);
        }
      }
      throw normalizeBrowserError(error);
    }
  }

  function getBufferedSessionsTarget() {
    return resolveReusableSessionTarget({
      maxConcurrentJobs: config.pdfMaxConcurrentJobs,
      prewarmedSessions: config.pdfPrewarmedSessions,
      reuseSessions: config.pdfReuseSessions,
    });
  }

  function resetSessionAssetRequests(session) {
    session.assetRequests.clear();
  }

  function markSessionInUse(session) {
    session.useCount += 1;
    resetSessionAssetRequests(session);
    return session;
  }

  async function destroySession(session) {
    try {
      await session.context.close();
    } catch (error) {
      console.error("Erro ao fechar contexto isolado do PDF service:", error);
    }
  }

  async function resetReusableSession(session) {
    try {
      if (session.page.isClosed()) {
        return false;
      }

      for (const contextPage of session.context.pages()) {
        if (contextPage !== session.page) {
          await contextPage.close();
        }
      }

      try {
        await session.page.goto("about:blank", {
          waitUntil: "domcontentloaded",
          timeout: 5000,
        });
      } catch {
        await session.page.setContent("<html><body></body></html>", {
          waitUntil: "domcontentloaded",
          timeout: 5000,
        });
      }

      await session.context.clearCookies();
      await session.context.clearPermissions();
      resetSessionAssetRequests(session);
      return !session.page.isClosed();
    } catch (error) {
      console.warn("[pdf-service] Falha ao resetar sessao reutilizavel do browser.", error);
      return false;
    }
  }

  function canReturnSessionToPool(session) {
    if (!config.pdfReuseSessions || !session.poolEligible || isClosing) {
      return false;
    }

    if (session.useCount >= config.pdfReuseSessionMaxUses) {
      return false;
    }

    return bufferedSessions.length < getBufferedSessionsTarget();
  }

  async function releaseSession(session) {
    if (canReturnSessionToPool(session)) {
      const resetOk = await resetReusableSession(session);
      if (resetOk) {
        bufferedSessions.push(session);
        scheduleBufferedSessionWarmups();
        return;
      }
    }

    await destroySession(session);
    scheduleBufferedSessionWarmups();
  }

  function scheduleBufferedSessionWarmups() {
    const target = getBufferedSessionsTarget();
    if (isClosing || target <= 0) {
      return;
    }

    while (bufferedSessions.length + pendingBufferedSessionWarmups.size < target) {
      const warmupPromise = createIsolatedPageSession()
        .then(async (session) => {
          if (isClosing) {
            await destroySession(session);
            return;
          }

          if (bufferedSessions.length < target) {
            bufferedSessions.push(session);
            return;
          }

          await destroySession(session);
        })
        .catch((error) => {
          console.warn("[pdf-service] Nao foi possivel preaquecer sessao isolada do browser.", error);
        })
        .finally(() => {
          pendingBufferedSessionWarmups.delete(warmupPromise);
        });

      pendingBufferedSessionWarmups.add(warmupPromise);
    }
  }

  async function takeBufferedSession() {
    while (bufferedSessions.length) {
      const session = bufferedSessions.shift();
      if (!session) {
        break;
      }

      if (session.page.isClosed()) {
        await destroySession(session);
        continue;
      }

      scheduleBufferedSessionWarmups();
      return markSessionInUse(session);
    }

    scheduleBufferedSessionWarmups();
    return null;
  }

  async function drainBufferedSessions() {
    const sessionsToClose = bufferedSessions.splice(0, bufferedSessions.length);
    await Promise.allSettled(sessionsToClose.map((session) => destroySession(session)));
    await Promise.allSettled(Array.from(pendingBufferedSessionWarmups));
  }

  async function closeBrowser() {
    isClosing = true;
    try {
      await drainBufferedSessions();

      if (!browserPromise) return;
      const browser = await browserPromise;
      await browser.close();
    } catch (error) {
      console.error("Erro ao fechar browser do PDF service:", error);
    } finally {
      browserPromise = null;
      isClosing = false;
    }
  }

  async function createPageWithRecovery(options = {}) {
    if (canUseDefaultSessionPool(options)) {
      const bufferedSession = await takeBufferedSession();
      if (bufferedSession) {
        return bufferedSession;
      }
    }

    try {
      const session = markSessionInUse(await createIsolatedPageSession(options));
      scheduleBufferedSessionWarmups();
      return session;
    } catch (error) {
      console.warn("[pdf-service] Falha ao criar page no contexto atual. Reiniciando browser/contexto.");
      await closeBrowser();
      try {
        const session = markSessionInUse(await createIsolatedPageSession(options));
        scheduleBufferedSessionWarmups();
        return session;
      } catch (retryError) {
        throw normalizeBrowserError(retryError || error);
      }
    }
  }

  async function createIsolatedPageSession(options = {}) {
    const { context, assetRequests } = await createContextWithNetworkGuard(options.allowedAssetOrigins);
    try {
      const page = await context.newPage();
      const session = {
        context,
        page,
        assetRequests,
        poolEligible: canUseDefaultSessionPool(options),
        useCount: 0,
        getAssetRequestSummary: () => summarizeAssetRequests(assetRequests),
      };
      session.close = async () => {
        await releaseSession(session);
      };
      return session;
    } catch (error) {
      try {
        await context.close();
      } catch {
        // Ignora erro de cleanup, mantendo erro original.
      }
      throw normalizeBrowserError(error);
    }
  }

  async function warmupBrowser() {
    try {
      await getBrowser();

      if (getBufferedSessionsTarget() > 0) {
        scheduleBufferedSessionWarmups();
        await Promise.allSettled(Array.from(pendingBufferedSessionWarmups));
        console.log(
          `[pdf-service] browser/contexto aquecidos com ${bufferedSessions.length} sessao(oes) pre-aquecida(s).`
        );
        return;
      }

      const session = await createIsolatedPageSession();
      try {
        await session.page.setContent("<html><body></body></html>", {
          waitUntil: "domcontentloaded",
          timeout: 5000,
        });
      } finally {
        await session.close();
      }

      console.log("[pdf-service] browser/contexto aquecidos.");
    } catch (error) {
      console.warn("[pdf-service] warmup do browser falhou.", error);
    }
  }

  return {
    createPageWithRecovery,
    setPageContentWithFallback: pageRenderLifecycle.setPageContentWithFallback,
    normalizePageBreaks: pageRenderLifecycle.normalizePageBreaks,
    warmupBrowser,
    closeBrowser,
    getStats() {
      return {
        browserLaunched: Boolean(browserPromise),
        bufferedSessions: bufferedSessions.length,
        bufferedSessionsTarget: getBufferedSessionsTarget(),
        pendingWarmups: pendingBufferedSessionWarmups.size,
        reuseSessionsEnabled: config.pdfReuseSessions,
        reuseSessionMaxUses: config.pdfReuseSessionMaxUses,
      };
    },
  };
}
