import { Page, Browser } from "@playwright/test";
import { Domain } from "./types";
import * as fs from "fs";
import * as path from "path";
import { randomDelay, getFileNameBase } from "./utils";
import { buildAdsLibraryUrl } from "./facebook";

export const extractDomainFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
};

export const formatDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

export const buildDomainSearchUrl = (domain: string): string => {
  const baseUrl = "https://www.facebook.com/ads/library/";
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "CL",
    is_targeted_country: "false",
    media_type: "all",
    q: domain,
    search_type: "keyword_unordered",
  });

  if (process.env.ADS_START_DATE && process.env.ADS_END_DATE) {
    params.set("start_date[min]", formatDate(process.env.ADS_START_DATE));
    params.set("start_date[max]", formatDate(process.env.ADS_END_DATE));
  }

  return `${baseUrl}?${params.toString()}`;
};

export const countDomainAds = async (page: Page): Promise<number> => {
  const result = await page.evaluate(() => {
    const gridElement = Array.from(document.querySelectorAll("*")).filter(
      (el) => getComputedStyle(el).display === "grid"
    )[0];

    if (!gridElement) return { total: 0 };

    const ads = Array.from(gridElement.children || []);

    const total = ads.reduce((total, ad) => {
      const quantityText = Array.from(ad.querySelectorAll("strong"))
        .map((el) => el.textContent || "")
        .find(
          (text) =>
            text.toLowerCase().includes("ads") ||
            text.toLowerCase().includes("ad") ||
            text.toLowerCase().includes("anuncios") ||
            text.toLowerCase().includes("anuncio")
        );

      if (!quantityText) return total + 1;

      // Intentar match con ambos formatos
      const matchAds = quantityText.match(/(\d+)\s*ads?/i);
      const matchAnuncios = quantityText.match(/(\d+)\s*anuncios?/i);

      const match = matchAds || matchAnuncios;
      if (match && match[1]) {
        return total + parseInt(match[1], 10);
      }

      return total + 1;
    }, 0);

    return { total };
  });

  return result.total;
};

const convertToCSV = (domainStats: { [key: string]: Domain }): string => {
  // Headers del CSV
  const headers = ["Domain", "Total Ads", "Search URL"];
  const rows = [headers.join(",")];

  // Convertir cada dominio a una fila de CSV
  Object.values(domainStats).forEach((domain) => {
    const row = [
      domain.url,
      domain.totalAds,
      `"${domain.searchUrl}"`, // Envolvemos la URL en comillas para manejar las comas
    ];
    rows.push(row.join(","));
  });

  return rows.join("\n");
};

export const saveDomainStats = (
  domainStats: { [key: string]: Domain },
  searchKeywords: string,
  isComplete: boolean = true
): string => {
  const domainsDir = path.join(process.cwd(), "domains");
  if (!fs.existsSync(domainsDir)) {
    fs.mkdirSync(domainsDir);
  }

  const fileNameBase = getFileNameBase(domainsDir, searchKeywords);

  // Guardar JSON
  const jsonFilePath = path.join(domainsDir, `${fileNameBase}.json`);
  const searchUrl = buildAdsLibraryUrl(searchKeywords);

  const jsonData = {
    domains: domainStats,
    timestamp: new Date().toISOString(),
    searchKeywords,
    searchConfig: {
      baseSearchUrl: searchUrl,
      startDate: process.env.ADS_START_DATE ? formatDate(process.env.ADS_START_DATE) : null,
      endDate: process.env.ADS_END_DATE ? formatDate(process.env.ADS_END_DATE) : null,
      country: "CL",
    },
    totalAdsFound: Object.values(domainStats).reduce((sum, domain) => sum + domain.totalAds, 0),
    uniqueDomains: Object.keys(domainStats).length,
    status: isComplete ? "completed" : "incomplete",
  };

  fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));

  // Guardar CSV
  const csvFilePath = path.join(domainsDir, `${fileNameBase}.csv`);
  const csvContent = convertToCSV(domainStats);
  fs.writeFileSync(csvFilePath, csvContent);

  console.log(`Domain results saved as JSON: ${jsonFilePath}`);
  console.log(`Domain results saved as CSV: ${csvFilePath}`);

  return jsonFilePath;
};

export const analyzeDomain = async (
  browser: Browser,
  domain: string,
  processUpdate?: (message: string) => void
): Promise<Domain | null> => {
  let page: Page | undefined;
  try {
    processUpdate?.(`Analyzing domain: ${domain}`);

    const context = await browser.newContext({
      locale: "es-AR",
      timezoneId: "America/Argentina/Buenos_Aires",
    });
    page = await context.newPage();

    const searchUrl = buildDomainSearchUrl(domain);
    processUpdate?.(`Navigating to search URL for ${domain}`);

    await page.goto(searchUrl);
    await randomDelay(1000, 2000);
    await page.waitForLoadState("networkidle");

    processUpdate?.(`Counting ads for ${domain}`);
    const totalAds = await countDomainAds(page);
    processUpdate?.(`Found ${totalAds} ads for ${domain}`);

    const domainData: Domain = {
      url: domain,
      totalAds,
      searchUrl,
    };

    await page.close();
    await context.close();
    return domainData;
  } catch (error) {
    console.error(`Error analyzing domain ${domain}:`, error);
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error("Error closing page:", closeError);
      }
    }
    return null;
  }
};

export const processNewDomains = async (
  browser: Browser,
  links: string[],
  existingDomains: Set<string>,
  processUpdate?: (message: string) => void
): Promise<{ [key: string]: Domain }> => {
  const newDomains: { [key: string]: Domain } = {};

  for (const link of links) {
    const domain = extractDomainFromUrl(link);
    if (!domain || existingDomains.has(domain)) continue;

    existingDomains.add(domain);
    const domainData = await analyzeDomain(browser, domain, processUpdate);
    if (domainData) {
      newDomains[domain] = domainData;
      await randomDelay(500, 1000);
    }
  }

  return newDomains;
};
