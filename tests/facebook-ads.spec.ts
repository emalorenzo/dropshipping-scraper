import { test } from "@playwright/test";
import {
  getRandomItem,
  randomDelay,
  humanScroll,
  naturalType,
  saveResults,
  simulateMouseMovement,
} from "./helpers/utils";
import { USER_AGENTS } from "./helpers/user-agents";
import { buildAdsLibraryUrl, getAds } from "./helpers/facebook";
import { analyzeProducts, saveProductStats } from "./helpers/products";
import { processNewDomains, saveDomainStats } from "./helpers/domains";
import { Ad, Domain, Product } from "./helpers/types";
import "dotenv/config";

test.describe("Facebook Ads Scraper", () => {
  test.setTimeout(3600000);

  test("Scrape Facebook Ads Library", async ({ browser }) => {
    let page;
    // Feature flags
    const analyzeDomains = process.env.ANALYZE_DOMAINS === "true";
    const shouldAnalyzeProducts = process.env.ANALYZE_PRODUCTS === "true";

    // Keep track of processed items
    const processedDomains = new Set<string>();
    const processedProducts = new Set<string>();

    // Store statistics
    const domainStats: { [key: string]: Domain } = {};
    const productStats: { [key: string]: Product } = {};

    // Variables para resultados
    let allAds: Ad[] = [];
    let searchKeywords = process.env.SEARCH_KEYWORDS;
    if (!searchKeywords) {
      throw new Error("SEARCH_KEYWORDS environment variable is not set");
    }

    try {
      const context = await browser.newContext({
        userAgent: getRandomItem(USER_AGENTS),
        viewport: { width: 1440, height: 900 },
        javaScriptEnabled: true,
        locale: "es-ES",
        httpCredentials: undefined,
        hasTouch: false,
        isMobile: false,
        extraHTTPHeaders: {
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
        },
      });

      page = await context.newPage();
      await randomDelay(1000, 2000);

      console.log("Starting login process...");
      await page.goto("https://www.facebook.com/");
      await simulateMouseMovement(page);
      await randomDelay(500, 1000);

      await page.waitForSelector("#email");
      await simulateMouseMovement(page);
      await randomDelay(200, 500);

      await naturalType(page, "#email", process.env.FACEBOOK_EMAIL || "");
      await randomDelay(300, 600);
      await simulateMouseMovement(page);
      await naturalType(page, "#pass", process.env.FACEBOOK_PASSWORD || "");

      await randomDelay(500, 1000);
      await simulateMouseMovement(page);

      await page.click('button[name="login"]');
      await randomDelay(2000, 3000);

      console.log("Login completed, navigating to Ads Library...");

      const adsLibraryUrl = buildAdsLibraryUrl(searchKeywords);
      await page.goto(adsLibraryUrl);
      await randomDelay(1000, 2000);

      console.log("Waiting for ads to load...");

      // Esperar a que aparezca el grid de anuncios
      await page.waitForFunction(
        () => {
          return Array.from(document.querySelectorAll("*")).some(
            (el) => getComputedStyle(el).display === "grid"
          );
        },
        { timeout: 30000 }
      );

      await randomDelay(2000, 3000);

      let previousAdsCount = 0;
      let currentAdsCount = 0;
      let sameCountIterations = 0;
      const MAX_SAME_COUNT_ITERATIONS = 3;
      let previousLinksCount = 0;

      console.log("Starting ads collection...");
      console.log(`Searching for ads with keywords: "${searchKeywords}"`);
      console.log(`Analyze domains: ${analyzeDomains}, Analyze products: ${shouldAnalyzeProducts}`);

      do {
        allAds = await getAds(page);
        currentAdsCount = allAds.length;

        console.log(`Ads found so far: ${currentAdsCount}`);

        if (currentAdsCount > previousAdsCount) {
          const newLinks = allAds.slice(previousLinksCount).flatMap((ad) => ad.links);

          // Process domains if enabled
          if (analyzeDomains) {
            console.log("Processing domains for new ads...");
            const newDomains = await processNewDomains(
              browser,
              newLinks,
              processedDomains,
              (message) => console.log(`Domain processing: ${message}`)
            );
            Object.assign(domainStats, newDomains);
          }

          // Process products if enabled
          if (shouldAnalyzeProducts) {
            const processedProducts = new Set<string>();
            const productStats: { [key: string]: Product } = {};

            // Analizar todos los productos de una vez
            console.log("Analyzing products from ads...");
            const newProductStats = await analyzeProducts(page, (message) => {
              console.log(`Product processing: ${message}`);
            });

            // Combinar los resultados
            Object.assign(productStats, newProductStats);

            // Guardar resultados
            console.log(`Total unique products processed: ${Object.keys(productStats).length}`);
            const productsPath = saveProductStats(productStats, searchKeywords, true);
            console.log(`Product statistics saved to: ${productsPath}`);
          }

          previousLinksCount = currentAdsCount;
        }

        if (currentAdsCount === previousAdsCount) {
          sameCountIterations++;
          console.log(`No changes iteration: ${sameCountIterations}/${MAX_SAME_COUNT_ITERATIONS}`);
          if (sameCountIterations === MAX_SAME_COUNT_ITERATIONS) {
            console.log("No new ads found.");
          }
        } else {
          sameCountIterations = 0;
          console.log("Found new ads, continuing search...");
        }

        previousAdsCount = currentAdsCount;

        await humanScroll(page);
        await randomDelay(500, 1000);
      } while (sameCountIterations < MAX_SAME_COUNT_ITERATIONS);

      console.log(`Process completed. Total ads found: ${allAds.length}`);

      // Save ads results
      const { jsonPath: adsPath } = saveResults(searchKeywords, allAds);
      console.log(`Ads results saved to: ${adsPath}`);

      // Save domain stats if enabled
      if (analyzeDomains) {
        console.log(`Total unique domains processed: ${processedDomains.size}`);
        const domainsPath = saveDomainStats(domainStats, searchKeywords, true);
        console.log(`Domain statistics saved to: ${domainsPath}`);
      }

      // Save product stats if enabled
      if (shouldAnalyzeProducts) {
        console.log(`Total unique products processed: ${processedProducts.size}`);
        const productsPath = saveProductStats(productStats, searchKeywords, true);
        console.log(`Product statistics saved to: ${productsPath}`);
      }
    } catch (error) {
      console.error("Process error:", error.message);

      // Guardar resultados parciales
      if (allAds?.length > 0) {
        console.log("Saving partial ads results...");
        const { jsonPath: adsPath } = saveResults(searchKeywords, allAds);
        console.log(`Partial ads results saved to: ${adsPath}`);
      }

      if (shouldAnalyzeProducts && Object.keys(productStats).length > 0) {
        console.log("Saving partial product results...");
        const productsPath = saveProductStats(productStats, searchKeywords, false);
        console.log(`Partial product statistics saved to: ${productsPath}`);
      }

      if (analyzeDomains && Object.keys(domainStats).length > 0) {
        console.log("Saving partial domain results...");
        const domainsPath = saveDomainStats(domainStats, searchKeywords, false);
        console.log(`Partial domain statistics saved to: ${domainsPath}`);
      }

      // Tomar screenshot del error
      if (page) {
        try {
          const screenshot = await page.screenshot({ fullPage: true });
          const { jsonPath, fileNameBase } = saveResults(
            searchKeywords,
            [], // Empty array for error case
            screenshot
          );
          console.error(`Error screenshot saved as: ${fileNameBase}.png`);
          console.error(`Error log saved to: ${jsonPath}`);
        } catch (screenshotError) {
          console.error("Error saving screenshot:", screenshotError.message);
        }
      }

      throw error;
    }
  });
});
