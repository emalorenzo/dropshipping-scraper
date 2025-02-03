import { Page, Browser } from "@playwright/test";
import { Product, ProductStats } from "./types";
import * as fs from "fs";
import * as path from "path";
import { randomDelay, getFileNameBase } from "./utils";
import { buildAdsLibraryUrl } from "./facebook";
import { formatDate } from "./domains";

export const analyzeProducts = async (
  page: Page,
  processUpdate?: (message: string) => void
): Promise<{ [key: string]: Product }> => {
  const productStats: { [key: string]: Product } = {};

  // Obtener todos los ads y sus links
  const adsData = await page.evaluate(() => {
    const gridElement = Array.from(document.querySelectorAll("*")).filter(
      (el) => getComputedStyle(el).display === "grid"
    )[0];

    if (!gridElement) return [];

    const ads = Array.from(gridElement.children || []);
    return ads.map((ad) => {
      // Obtener la cantidad de ads
      const quantityText = Array.from(ad.querySelectorAll("strong"))
        .map((el) => el.textContent || "")
        .find(
          (text) =>
            text.toLowerCase().includes("ads") ||
            text.toLowerCase().includes("ad") ||
            text.toLowerCase().includes("anuncios") ||
            text.toLowerCase().includes("anuncio")
        );

      // Extraer el número de ads
      let quantity = 1;
      if (quantityText) {
        // Intentar match con ambos formatos
        const matchAds = quantityText.match(/(\d+)\s*ads?/i);
        const matchAnuncios = quantityText.match(/(\d+)\s*anuncios?/i);
        const match = matchAds || matchAnuncios;
        if (match && match[1]) {
          quantity = parseInt(match[1], 10);
        }
      }

      // Obtener todos los links del ad
      const links = Array.from(ad.querySelectorAll("a")).map((a) => a.href);

      return {
        quantity,
        links,
      };
    });
  });

  // Procesar cada ad y actualizar las estadísticas de productos
  for (const adData of adsData) {
    for (const link of adData.links) {
      if (!productStats[link]) {
        productStats[link] = {
          url: link,
          totalAds: 0,
          searchUrl: buildAdsLibraryUrl(process.env.SEARCH_KEYWORDS || ""),
        };
      }
      productStats[link].totalAds += adData.quantity;
    }
  }

  return productStats;
};

const convertToCSV = (productStats: { [key: string]: Product }): string => {
  // Headers del CSV
  const headers = ["Product URL", "Total Ads", "Search URL"];
  const rows = [headers.join(",")];

  // Convertir cada producto a una fila de CSV
  Object.values(productStats).forEach((product) => {
    const row = [`"${product.url}"`, product.totalAds, `"${product.searchUrl}"`];
    rows.push(row.join(","));
  });

  return rows.join("\n");
};

export const saveProductStats = (
  productStats: { [key: string]: Product },
  searchKeywords: string,
  isComplete: boolean = true
): string => {
  const productsDir = path.join(process.cwd(), "products");
  if (!fs.existsSync(productsDir)) {
    fs.mkdirSync(productsDir);
  }

  const fileNameBase = getFileNameBase(productsDir, searchKeywords);

  // Guardar JSON
  const jsonFilePath = path.join(productsDir, `${fileNameBase}.json`);
  const searchUrl = buildAdsLibraryUrl(searchKeywords);

  const jsonData: ProductStats = {
    products: productStats,
    timestamp: new Date().toISOString(),
    searchKeywords,
    searchConfig: {
      baseSearchUrl: searchUrl,
      startDate: process.env.ADS_START_DATE ? formatDate(process.env.ADS_START_DATE) : null,
      endDate: process.env.ADS_END_DATE ? formatDate(process.env.ADS_END_DATE) : null,
      country: "CL",
    },
    totalAdsFound: Object.values(productStats).reduce((sum, product) => sum + product.totalAds, 0),
    uniqueProducts: Object.keys(productStats).length,
    status: isComplete ? "completed" : "incomplete",
  };

  fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));

  // Guardar CSV
  const csvFilePath = path.join(productsDir, `${fileNameBase}.csv`);
  const csvContent = convertToCSV(productStats);
  fs.writeFileSync(csvFilePath, csvContent);

  console.log(`Product results saved as JSON: ${jsonFilePath}`);
  console.log(`Product results saved as CSV: ${csvFilePath}`);

  return jsonFilePath;
};
