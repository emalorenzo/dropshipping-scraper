export interface Ad {
  title: string;
  quantity: string;
  links: string[];
}

export interface Domain {
  url: string;
  totalAds: number;
  searchUrl: string;
}

export interface Product {
  url: string;
  totalAds: number;
  searchUrl: string;
  title?: string;
}

export type SearchStatus = "completed" | "incomplete";

export interface DomainStats {
  domains: { [key: string]: Domain };
  timestamp: string;
  searchKeywords: string;
  searchConfig: {
    baseSearchUrl: string;
    startDate: string | null;
    endDate: string | null;
    country: string;
  };
  totalAdsFound: number;
  uniqueDomains: number;
  status: SearchStatus;
}

export interface ProductStats {
  products: { [key: string]: Product };
  timestamp: string;
  searchKeywords: string;
  searchConfig: {
    baseSearchUrl: string;
    startDate: string | null;
    endDate: string | null;
    country: string;
  };
  totalAdsFound: number;
  uniqueProducts: number;
  status: SearchStatus;
}
