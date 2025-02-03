import { Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

export const getRandomItem = <T>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

export const randomDelay = async (min: number, max: number): Promise<void> => {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  await new Promise((resolve) => setTimeout(resolve, delay));
};

export const simulateMouseMovement = async (page: Page): Promise<void> => {
  const randomX = Math.floor(Math.random() * 800);
  const randomY = Math.floor(Math.random() * 600);

  await page.mouse.move(randomX, randomY, {
    steps: 10,
  });
};

export const humanScroll = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const scrollHeight = document.body.scrollHeight;
    const viewportHeight = window.innerHeight;
    let currentScroll = window.scrollY;
    let targetScroll = currentScroll;

    const performScroll = async () => {
      const scrollAmount = Math.floor(Math.random() * (1200 - 800 + 1) + 800);
      targetScroll += scrollAmount;

      if (targetScroll + viewportHeight >= scrollHeight - 200) {
        if (Math.random() < 0.8) {
          targetScroll = scrollHeight - viewportHeight;
        } else {
          targetScroll -= Math.floor(Math.random() * 300 + 100);
        }
      }

      targetScroll = Math.max(0, Math.min(targetScroll, scrollHeight - viewportHeight));

      window.scrollTo({
        top: targetScroll,
        behavior: "smooth",
      });

      await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 30));

      if (Math.random() < 0.05) {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 400 + 200));
      }
    };

    while (currentScroll + viewportHeight < scrollHeight - 200) {
      await performScroll();
      currentScroll = window.scrollY;

      if (Math.random() < 0.3) {
        const fastScrolls = Math.floor(Math.random() * 3) + 2;
        for (
          let i = 0;
          i < fastScrolls && currentScroll + viewportHeight < scrollHeight - 200;
          i++
        ) {
          await performScroll();
        }
      }
    }
  });
};

export const naturalType = async (page: Page, selector: string, text: string): Promise<void> => {
  const chunks = text.match(/.{1,3}/g) || [];

  for (const chunk of chunks) {
    const delay = Math.random() * 100 + 30;
    await page.type(selector, chunk, { delay });

    if (Math.random() < 0.02) {
      await randomDelay(100, 200);
      await page.keyboard.press("Backspace");
      await randomDelay(100, 200);
      await page.type(selector, chunk[chunk.length - 1], { delay });
    }

    await randomDelay(10, 50);
  }
};

export const getNextVersionNumber = (
  directory: string,
  baseFileName: string,
  date: string
): number => {
  const files = fs.readdirSync(directory);
  let maxVersion = 0;

  const pattern = new RegExp(`^${baseFileName}_${date}_v(\\d+)`);
  files.forEach((file) => {
    const match = file.match(pattern);
    if (match) {
      const version = parseInt(match[1], 10);
      maxVersion = Math.max(maxVersion, version);
    }
  });

  return maxVersion + 1;
};

export const getFileNameBase = (directory: string, searchKeywords: string): string => {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const baseFileName = searchKeywords
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const version = getNextVersionNumber(directory, baseFileName, dateStr);
  return `${baseFileName}_${dateStr}_v${version}`;
};

export const saveResults = (
  searchKeywords: string,
  ads: any[],
  screenshot: Buffer | null = null
) => {
  // Create ads directory if it doesn't exist
  const adsDir = path.join(process.cwd(), "ads");
  if (!fs.existsSync(adsDir)) {
    fs.mkdirSync(adsDir);
  }

  const fileNameBase = getFileNameBase(adsDir, searchKeywords);

  // Save JSON
  const jsonPath = path.join(adsDir, `${fileNameBase}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(ads, null, 2));

  // Save screenshot if exists
  if (screenshot) {
    const screenshotPath = path.join(adsDir, `${fileNameBase}.png`);
    fs.writeFileSync(screenshotPath, screenshot);
  }

  return {
    jsonPath,
    fileNameBase,
  };
};
