import { Page } from "@playwright/test";
import { Ad } from "./types";
import { formatDate } from "./domains";

// Lista de dominios a excluir
export const EXCLUDED_DOMAINS = [
  "google.com",
  "whatsapp.com",
  "instagram.com",
  "messenger.com",
  "facebook.com",
  "goo.gl",
  "fb.com",
  "fb.me",
  "t.me",
  "wa.me",
  "m.me",
  "airbnb.com",
  "apple.com",
  "spotify.com",
  "waze.com",
  "wa.link",
];

// Parámetros de tracking a remover
const TRACKING_PARAMS = [
  "fbclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

export const buildAdsLibraryUrl = (searchKeywords: string): string => {
  const baseUrl = "https://www.facebook.com/ads/library/";
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "CL",
    is_targeted_country: "false",
    media_type: "all",
    q: searchKeywords,
    search_type: "keyword_unordered",
  });

  if (process.env.ADS_START_DATE && process.env.ADS_END_DATE) {
    params.set("start_date[min]", formatDate(process.env.ADS_START_DATE));
    params.set("start_date[max]", formatDate(process.env.ADS_END_DATE));
  }

  return `${baseUrl}?${params.toString()}`;
};

export const getAds = async (page: Page): Promise<Ad[]> => {
  return await page.evaluate(
    ({ excludedDomains, trackingParams }) => {
      const debug: any[] = [];

      const cleanUrl = (urlString: string): string => {
        try {
          const url = new URL(urlString);

          // Si es una URL de l.facebook.com, extraer y decodificar la URL real
          if (url.hostname === "l.facebook.com" && url.pathname === "/l.php") {
            const realUrl = url.searchParams.get("u");
            if (realUrl) {
              // Decodificar la URL y limpiar sus parámetros de tracking
              const decodedUrl = new URL(decodeURIComponent(realUrl));
              trackingParams.forEach((param) => decodedUrl.searchParams.delete(param));
              return decodedUrl.toString();
            }
          }

          // Para otras URLs, solo limpiar parámetros de tracking
          trackingParams.forEach((param) => url.searchParams.delete(param));
          return url.toString();
        } catch (e) {
          return urlString;
        }
      };

      const getLinksForAd = (ad: Element): string[] => {
        // Primero limpiamos todas las URLs
        const allLinks = Array.from(ad.querySelectorAll("a")).map((a) => cleanUrl(a.href));
        debug.push({ allLinks });

        const filteredLinks = allLinks.filter((href) => {
          try {
            const url = new URL(href);
            // Verificar si está en la lista de excluidos
            const isExcluded = excludedDomains.some((domain) => url.hostname.includes(domain));
            debug.push({
              type: "direct",
              url: href,
              isExcluded,
            });
            return !isExcluded;
          } catch (e) {
            return false;
          }
        });

        debug.push({ filteredLinks });
        return filteredLinks;
      };

      const gridElement = Array.from(document.querySelectorAll("*")).filter(
        (el) => getComputedStyle(el).display === "grid"
      )[0];

      if (!gridElement) {
        console.log("No grid element found");
        return [];
      }

      const ads = Array.from(gridElement.children || []);
      console.log(`Found ${ads.length} ad elements`);

      const processedAds = ads.map((ad) => {
        const title = (ad.querySelector("a span") as HTMLElement)?.innerText || "";
        const links = getLinksForAd(ad);
        const quantityElement = Array.from(ad.querySelectorAll("strong"))
          .map((el) => el as HTMLElement)
          .find(
            (strong) =>
              strong.innerText.toLowerCase().includes("ads") ||
              strong.innerText.toLowerCase().includes("anuncios")
          );

        return {
          title,
          quantity: quantityElement?.innerText || "1 ad",
          links,
        };
      });

      console.log("Debug info:", debug);
      console.log(`Processed ${processedAds.length} ads`);

      return processedAds.filter((ad) => ad.links.length > 0);
    },
    { excludedDomains: EXCLUDED_DOMAINS, trackingParams: TRACKING_PARAMS }
  );
};
