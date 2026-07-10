"use client";

// TabBar wired to live badge counts (unread in today's drop, reviews due).

import { useDrop, useStoreVersion } from "@/lib/hooks";
import { getDueConcepts, getReadMap } from "@/lib/store";
import { TabBar } from "./TabBar";

export function TabBarLive() {
  const drop = useDrop();
  useStoreVersion();

  let today = 0;
  if (drop.feed) {
    const readMap = getReadMap();
    const follows = drop.feed.items.filter((i) => i.source === "follow" && !i.withdrawn);
    const dropDate = follows[0]?.published;
    today = follows.filter((i) => i.published === dropDate && !readMap[i.id]).length;
  }
  const concepts = getDueConcepts().length;

  return <TabBar badges={{ today: today || undefined, concepts: concepts || undefined }} />;
}
